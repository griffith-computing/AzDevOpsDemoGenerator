import { describe, expect, it, vi } from 'vitest'
import type { ProvisioningContext } from '../../types'
import { createProvisioningState } from '../../types'
import { sourceImportsPhase } from './sourceImports'

function createContext(): ProvisioningContext {
  const importFile = 'ImportSourceCode/PublicRepo.json'
  const files: Record<string, unknown> = {
    [importFile]: {
      parameters: {
        gitSource: { url: 'https://github.com/example/public-repo.git' },
        serviceEndpointId: '$PublicRepo-code$',
        deleteServiceEndpointAfterImportIsDone: true,
      },
    },
  }
  const loader = {
    entry: {
      anonymousImportFiles: [importFile],
      importOnlyServiceEndpoints: ['PublicRepo-code'],
    },
    filesUnder: (directory: string) =>
      Object.keys(files).filter((file) => file.startsWith(`${directory}/`)),
    json: async (path: string) => files[path],
  } as unknown as ProvisioningContext['loader']
  const request = vi.fn(async (_path: string, init: RequestInit) => {
    if (init.method === 'POST') {
      return { importRequestId: 7, status: 'queued' }
    }
    return { importRequestId: 7, status: 'completed' }
  })
  const state = createProvisioningState('project-id', 'Demo')
  state.repositoryIds.set('PublicRepo', 'repository-id')

  return {
    client: { request } as unknown as ProvisioningContext['client'],
    loader,
    template: {
      Key: 'template',
      Name: 'Template',
      TemplateFolder: 'Template',
      Description: 'Template',
    },
    state,
    signal: new AbortController().signal,
  }
}

describe('sourceImportsPhase', () => {
  it('omits the legacy service endpoint for a bundled public source', async () => {
    const context = createContext()

    await sourceImportsPhase.run(context)

    const request = vi.mocked(context.client.request)
    const [, init] = request.mock.calls[0]
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      parameters: {
        gitSource: { url: 'https://github.com/example/public-repo.git' },
      },
    })
  })
})
