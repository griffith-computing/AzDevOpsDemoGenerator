import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningContext, ProvisioningPhase, ProvisioningState } from '../../types'
import { importSourceCodeFiles, repositoryNameFromFile, waitUnlessAborted } from './shared'

interface GitImportSourceTemplate {
  url: string
}

interface ImportSourceCodeParametersTemplate {
  gitSource: GitImportSourceTemplate
  serviceEndpointId?: string
  deleteServiceEndpointAfterImportIsDone?: boolean
}

interface ImportSourceCodeTemplate {
  parameters: ImportSourceCodeParametersTemplate
}

interface GitImportRequestParameters {
  gitSource: GitImportSourceTemplate
  serviceEndpointId?: string
  deleteServiceEndpointAfterImportIsDone?: boolean
}

interface GitImportStatusDetail {
  currentStep?: number
  allSteps?: string[]
  errorMessage?: string
}

type GitAsyncOperationStatus = 'queued' | 'inProgress' | 'completed' | 'failed' | 'abandoned'

interface GitImportRequest {
  importRequestId: number
  status: GitAsyncOperationStatus
  detailedStatus?: GitImportStatusDetail
}

const importPollTimeoutMs = 10 * 60 * 1000
const importPollMaxDelayMs = 8_000

/**
 * Imports source code into each repository created by the `repositories`
 * phase, polling the resulting Azure DevOps import operation until it
 * completes instead of sleeping a fixed amount of time.
 *
 * GitHub credentials are out of scope for this MVP: a template that imports
 * from a public URL with no `serviceEndpointId` is supported, but one that
 * needs a credentialed service connection (GitHub or otherwise) fails with
 * an actionable error rather than importing nothing silently.
 */
export const sourceImportsPhase: ProvisioningPhase = {
  id: 'source-imports',
  label: 'Import source code',
  dependsOn: ['repositories', 'service-endpoints'],
  isApplicable: (context) => importSourceCodeFiles(context.loader).length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context

    for (const file of importSourceCodeFiles(loader)) {
      const repositoryName = repositoryNameFromFile(file)
      const repositoryId = state.repositoryIds.get(repositoryName)
      if (!repositoryId) {
        throw new Error(
          `Cannot import source code for "${repositoryName}" because its repository was not created.`,
        )
      }

      const raw = await loader.json<ImportSourceCodeTemplate>(file)
      const resolved = applyTemplateValues(raw, state)
      const parameters = resolveImportParameters(resolved.parameters, repositoryName, state)

      const importRequest = await client.request<GitImportRequest>(
        `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
          repositoryId,
        )}/importRequests?api-version=7.1`,
        { method: 'POST', body: JSON.stringify({ parameters }) },
        signal,
      )

      await pollImportRequest(context, repositoryId, importRequest.importRequestId, repositoryName)
    }
  },
}

function resolveImportParameters(
  parameters: ImportSourceCodeParametersTemplate,
  repositoryName: string,
  state: ProvisioningState,
): GitImportRequestParameters {
  if (!parameters.serviceEndpointId) {
    return { gitSource: parameters.gitSource }
  }

  const resolvedServiceEndpointId = resolveServiceEndpointId(parameters.serviceEndpointId, state)
  if (!resolvedServiceEndpointId) {
    throw new Error(
      `Importing "${repositoryName}" requires the credentialed service connection ` +
        `"${parameters.serviceEndpointId}", but this browser-based provisioning tool does not create ` +
        'credentialed service connections (including GitHub) yet. Create that service connection under ' +
        'Project Settings > Service connections first, or use a template that imports from a public URL ' +
        'with no serviceEndpointId.',
    )
  }

  return {
    gitSource: parameters.gitSource,
    serviceEndpointId: resolvedServiceEndpointId,
    deleteServiceEndpointAfterImportIsDone: parameters.deleteServiceEndpointAfterImportIsDone,
  }
}

const placeholderPattern = /^\$([^$]+)\$$/u

/**
 * `applyTemplateValues` only substitutes `$token$` placeholders made of
 * letters/digits, so a `serviceEndpointId` such as `$eShopOnWeb-code$` is
 * never rewritten by it. Resolve it here instead, against any service
 * endpoint a prior phase may have provisioned.
 */
function resolveServiceEndpointId(rawValue: string, state: ProvisioningState): string | undefined {
  const match = placeholderPattern.exec(rawValue.trim())
  if (!match) {
    // Not a placeholder: treat it as an already-resolved endpoint id.
    return rawValue
  }

  const name = match[1]
  const fromEndpointIds = state.endpointIds.get(name)
  if (fromEndpointIds) {
    return fromEndpointIds
  }

  const fromValues = state.values.get(name)
  return typeof fromValues === 'string' && fromValues.length > 0 ? fromValues : undefined
}

async function pollImportRequest(
  context: ProvisioningContext,
  repositoryId: string,
  importRequestId: number,
  repositoryName: string,
): Promise<void> {
  const { client, state, signal } = context
  const deadline = Date.now() + importPollTimeoutMs
  let delay = 1_000

  while (Date.now() < deadline) {
    const importRequest = await client.request<GitImportRequest>(
      `/${encodeURIComponent(state.projectId)}/_apis/git/repositories/${encodeURIComponent(
        repositoryId,
      )}/importRequests/${encodeURIComponent(String(importRequestId))}?api-version=7.1`,
      {},
      signal,
    )

    if (importRequest.status === 'completed') {
      return
    }

    if (importRequest.status === 'failed' || importRequest.status === 'abandoned') {
      const detail = importRequest.detailedStatus?.errorMessage
      throw new Error(
        `Importing source code into "${repositoryName}" ${importRequest.status}.${detail ? ` ${detail}` : ''}`,
      )
    }

    await waitUnlessAborted(delay, signal)
    delay = Math.min(delay * 1.5, importPollMaxDelayMs)
  }

  throw new Error(
    `Importing source code into "${repositoryName}" did not complete within ${importPollTimeoutMs / 60_000} minutes.`,
  )
}
