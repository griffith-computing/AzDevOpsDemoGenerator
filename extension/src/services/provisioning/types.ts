import type { CatalogTemplate } from '../../types'
import type { AzureDevOpsClient } from '../AzureDevOpsClient'
import type { TemplateAssetLoader } from '../TemplateAssetLoader'

export interface ProvisioningState {
  projectId: string
  projectName: string
  defaultTeamName: string
  repositoryIds: Map<string, string>
  endpointIds: Map<string, string>
  variableGroupIds: Map<string, number>
  values: Map<string, unknown>
}

export interface ProvisioningContext {
  client: AzureDevOpsClient
  loader: TemplateAssetLoader
  template: CatalogTemplate
  state: ProvisioningState
  signal: AbortSignal
}

export interface ProvisioningPhase {
  id: string
  label: string
  dependsOn?: string[]
  isApplicable(context: ProvisioningContext): boolean
  run(context: ProvisioningContext): Promise<void>
}

export function createProvisioningState(
  projectId: string,
  projectName: string,
): ProvisioningState {
  return {
    projectId,
    projectName,
    defaultTeamName: `${projectName} Team`,
    repositoryIds: new Map(),
    endpointIds: new Map(),
    variableGroupIds: new Map(),
    values: new Map(),
  }
}
