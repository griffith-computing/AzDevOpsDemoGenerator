import type {
  ProvisioningEvent,
  ProvisioningRequest,
  SdkContext,
} from '../../types'
import { AzureDevOpsClient } from '../AzureDevOpsClient'
import { TemplateAssetLoader } from '../TemplateAssetLoader'
import { provisioningPhases } from './phases'
import { validateProjectName } from './projectName'
import { runPhases } from './runPhases'
import { createProvisioningState } from './types'

interface OperationReference {
  id: string
  status?: string
  url?: string
}

interface Project {
  id: string
  name: string
  state: string
}

interface ProjectSettings {
  type?: string
  id?: string
}

const processIds: Record<string, string> = {
  agile: 'adcc42ab-9882-485e-a3ed-7678f01f66bc',
  basic: 'b8a3a93e-4b42-4e70-bf52-5b8f46f6e6b3',
  cmmi: '27450541-8e31-4150-9947-dc59f998fc01',
  scrum: '6b724908-ef14-45cf-84f8-768b5384da45',
}

export class ProvisioningEngine {
  private readonly client: AzureDevOpsClient
  private readonly emit: (event: ProvisioningEvent) => void

  constructor(
    context: SdkContext,
    emit: (event: ProvisioningEvent) => void,
  ) {
    this.emit = emit
    this.client = new AzureDevOpsClient(context)
  }

  async provision(
    request: ProvisioningRequest,
    signal: AbortSignal,
  ): Promise<void> {
    this.emitStep('validate', 'Validate request', 'running')
    validateProjectName(request.projectName)
    const loader = new TemplateAssetLoader(request.template.TemplateFolder)
    const projectSettings = await this.loadProjectSettings(loader)
    this.emitStep('validate', 'Validate request', 'succeeded')

    this.emitStep('project', 'Create Azure DevOps project', 'running')
    const project = await this.createProject(
      request.projectName,
      projectSettings,
      signal,
    )
    this.emitStep(
      'project',
      'Create Azure DevOps project',
      'succeeded',
      `${project.name} is ${project.state}.`,
    )

    const state = createProvisioningState(project.id, project.name)
    for (const [name, value] of Object.entries(request.parameters)) {
      state.values.set(name, value)
    }

    await runPhases(
      provisioningPhases,
      {
        client: this.client,
        loader,
        template: request.template,
        state,
        signal,
      },
      this.emit,
    )
  }

  private async loadProjectSettings(
    loader: TemplateAssetLoader,
  ): Promise<ProjectSettings> {
    const projectTemplate = await loader.json<{
      ProjectSettings?: string
    }>('ProjectTemplate.json')
    const settingsFile = projectTemplate.ProjectSettings ?? 'ProjectSettings.json'
    return loader.json<ProjectSettings>(settingsFile)
  }

  private async createProject(
    projectName: string,
    settings: ProjectSettings,
    signal: AbortSignal,
  ): Promise<Project> {
    const processTemplateId =
      settings.id ?? processIds[(settings.type ?? 'scrum').toLocaleLowerCase()]
    if (!processTemplateId) {
      throw new Error(`Unsupported process template type: ${settings.type}.`)
    }

    await this.client.request<OperationReference>(
      '/_apis/projects?api-version=7.1',
      {
        method: 'POST',
        body: JSON.stringify({
          name: projectName,
          capabilities: {
            versioncontrol: { sourceControlType: 'Git' },
            processTemplate: { templateTypeId: processTemplateId },
          },
        }),
      },
      signal,
    )

    return this.pollProject(projectName, signal)
  }

  private async pollProject(
    projectName: string,
    signal: AbortSignal,
  ): Promise<Project> {
    const deadline = Date.now() + 5 * 60 * 1000
    let delay = 1_000

    while (Date.now() < deadline) {
      const project = await this.client.request<Project>(
        `/_apis/projects/${encodeURIComponent(projectName)}?includeCapabilities=false&api-version=7.1`,
        {},
        signal,
      )

      if (project.state.toLocaleLowerCase() === 'wellformed') {
        return project
      }

      if (['deleting', 'createpending'].includes(project.state.toLocaleLowerCase())) {
        await abortableDelay(delay, signal)
        delay = Math.min(delay * 1.5, 5_000)
        continue
      }

      throw new Error(`Project creation entered unexpected state: ${project.state}.`)
    }

    throw new Error('Project creation did not complete within five minutes.')
  }

  private emitStep(
    stepId: string,
    label: string,
    status: ProvisioningEvent['status'],
    message?: string,
  ) {
    this.emit({ stepId, label, status, message })
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds)
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}
