export interface OperationReference {
  id: string
  pluginId?: string
  status?: string
  detailedMessage?: string
  resultMessage?: string
}

export interface CreatedProject {
  id: string
  name: string
  state: string
}

export interface ProjectCreationClient {
  request<T>(
    path: string,
    init?: RequestInit,
    signal?: AbortSignal,
  ): Promise<T>
}

interface PollOptions {
  timeoutMilliseconds?: number
  delay?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

const pendingOperationStatuses = new Set(['notset', 'queued', 'inprogress'])
const pendingProjectStates = new Set(['createpending', 'new', 'unchanged'])

export async function waitForProjectCreation(
  client: ProjectCreationClient,
  initialOperation: OperationReference,
  projectName: string,
  signal: AbortSignal,
  options: PollOptions = {},
): Promise<CreatedProject> {
  if (!initialOperation.id) {
    throw new Error('Azure DevOps did not return a project creation operation ID.')
  }

  const deadline = Date.now() + (options.timeoutMilliseconds ?? 5 * 60 * 1000)
  const delay = options.delay ?? abortableDelay
  const pluginId = initialOperation.pluginId
  let waitMilliseconds = 1_000
  let operation = initialOperation

  while (Date.now() < deadline) {
    const status = operation.status?.toLocaleLowerCase() ?? 'notset'
    if (status === 'succeeded') {
      break
    }
    if (status === 'failed' || status === 'cancelled') {
      const detail = operation.resultMessage ?? operation.detailedMessage
      throw new Error(
        `Project creation ${status}${detail ? `: ${detail}` : '.'}`,
      )
    }
    if (!pendingOperationStatuses.has(status)) {
      throw new Error(
        `Project creation operation entered unexpected status: ${operation.status}.`,
      )
    }

    await delay(waitMilliseconds, signal)
    waitMilliseconds = Math.min(waitMilliseconds * 1.5, 5_000)
    const pluginQuery = pluginId
      ? `&pluginId=${encodeURIComponent(pluginId)}`
      : ''
    operation = await client.request<OperationReference>(
      `/_apis/operations/${encodeURIComponent(operation.id)}?api-version=7.1${pluginQuery}`,
      {},
      signal,
    )
  }

  if (operation.status?.toLocaleLowerCase() !== 'succeeded') {
    throw new Error('Project creation operation did not complete within five minutes.')
  }

  waitMilliseconds = 1_000
  while (Date.now() < deadline) {
    const project = await client.request<CreatedProject>(
      `/_apis/projects/${encodeURIComponent(projectName)}?includeCapabilities=false&api-version=7.1`,
      {},
      signal,
    )
    const state = project.state.toLocaleLowerCase()
    if (state === 'wellformed') {
      return project
    }
    if (!pendingProjectStates.has(state)) {
      throw new Error(`Project creation entered unexpected state: ${project.state}.`)
    }

    await delay(waitMilliseconds, signal)
    waitMilliseconds = Math.min(waitMilliseconds * 1.5, 5_000)
  }

  throw new Error('Project creation did not complete within five minutes.')
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
