import { describe, expect, it, vi } from 'vitest'
import { serviceEndpointsPhase } from './serviceEndpoints'
import { createProvisioningState } from '../../types'
import type { ProvisioningContext } from '../../types'

interface MockLoaderOptions {
  files: Record<string, unknown>
}

function mockLoader({ files }: MockLoaderOptions): ProvisioningContext['loader'] {
  return {
    filesUnder: (directory: string) =>
      Object.keys(files).filter((file) => file.startsWith(`${directory}/`)),
    json: async (path: string) => files[path],
  } as unknown as ProvisioningContext['loader']
}

function contextWith(
  loader: ProvisioningContext['loader'],
  client: ProvisioningContext['client'],
): ProvisioningContext {
  const state = createProvisioningState('project-id', 'Contoso PoC')
  return {
    client,
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

describe('serviceEndpointsPhase.isApplicable', () => {
  it('is applicable for either ServiceEndpoints or ServiceEndPoints casing', () => {
    const withStandardCasing = contextWith(
      mockLoader({ files: { 'ServiceEndpoints/GitHub.json': {} } }),
      {} as ProvisioningContext['client'],
    )
    const withLegacyCasing = contextWith(
      mockLoader({ files: { 'ServiceEndPoints/GitHub.json': {} } }),
      {} as ProvisioningContext['client'],
    )
    const withNone = contextWith(mockLoader({ files: {} }), {} as ProvisioningContext['client'])

    expect(serviceEndpointsPhase.isApplicable(withStandardCasing)).toBe(true)
    expect(serviceEndpointsPhase.isApplicable(withLegacyCasing)).toBe(true)
    expect(serviceEndpointsPhase.isApplicable(withNone)).toBe(false)
  })
})

describe('serviceEndpointsPhase.run', () => {
  it('substitutes credential parameters supplied via state.values and records the created endpoint', async () => {
    const loader = mockLoader({
      files: {
        'ServiceEndpoints/GitHub.json': {
          name: 'GitHub',
          type: 'github',
          url: 'https://github.com',
          authorization: {
            scheme: 'UsernamePassword',
            parameters: { username: '$GitUserName$', password: '$GitUserPassword$' },
          },
        },
      },
    })

    const request = vi.fn(async (path: string, _init: RequestInit) => {
      expect(path).toBe('/_apis/serviceendpoint/endpoints?api-version=7.1')
      return { id: 'endpoint-id-1', name: 'GitHub' }
    })
    const client = { request } as unknown as ProvisioningContext['client']

    const context = contextWith(loader, client)
    context.state.values.set('GitUserName', 'demo-user')
    context.state.values.set('GitUserPassword', 'super-secret-pat')

    await serviceEndpointsPhase.run(context)

    expect(request).toHaveBeenCalledTimes(1)
    const [, init] = request.mock.calls[0]
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body).toMatchObject({
      name: 'GitHub',
      authorization: {
        scheme: 'UsernamePassword',
        parameters: { username: 'demo-user', password: 'super-secret-pat' },
      },
      serviceEndpointProjectReferences: [
        {
          projectReference: { id: 'project-id', name: 'Contoso PoC' },
          name: 'GitHub',
        },
      ],
    })

    expect(context.state.endpointIds.get('GitHub')).toBe('endpoint-id-1')
    expect(context.state.values.get('GitHub')).toBe('endpoint-id-1')
  })

  it('fails actionably instead of fabricating a missing credential value', async () => {
    const loader = mockLoader({
      files: {
        'ServiceEndpoints/SonarQube.json': {
          name: 'SonarQube',
          type: 'sonarqube',
          url: 'https://sonarqube.example.com',
          authorization: {
            scheme: 'Token',
            parameters: { apitoken: '$Apikey$' },
          },
        },
      },
    })
    const request = vi.fn()
    const client = { request } as unknown as ProvisioningContext['client']

    const context = contextWith(loader, client)

    await expect(serviceEndpointsPhase.run(context)).rejects.toThrow(
      /requires credential\(s\) "Apikey"/u,
    )
    expect(request).not.toHaveBeenCalled()
  })

  it('creates one endpoint per discovered file and keeps prior endpoint ids resolvable', async () => {
    const loader = mockLoader({
      files: {
        'ServiceEndpoints/First.json': { name: 'First', type: 'generic' },
        'ServiceEndpoints/Second.json': {
          name: 'Second',
          type: 'generic',
          description: 'links to $First$',
        },
      },
    })

    let created = 0
    const request = vi.fn(async (_path: string, _init: RequestInit) => {
      created += 1
      return { id: `endpoint-${created}`, name: created === 1 ? 'First' : 'Second' }
    })
    const client = { request } as unknown as ProvisioningContext['client']
    const context = contextWith(loader, client)

    await serviceEndpointsPhase.run(context)

    expect(request).toHaveBeenCalledTimes(2)
    const secondBody = JSON.parse(
      (request.mock.calls[1][1] as RequestInit).body as string,
    )
    // "First" was resolved via applyTemplateValues from state.values, populated
    // by the first iteration before the second file was processed.
    expect(secondBody.description).toBe('links to endpoint-1')
  })
})
