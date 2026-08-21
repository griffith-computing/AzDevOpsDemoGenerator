import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AzureDevOpsClient,
  AzureDevOpsNetworkError,
  AzureDevOpsRequestError,
} from './AzureDevOpsClient'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AzureDevOpsClient', () => {
  it('uses the current organization and bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const client = new AzureDevOpsClient({
      organizationName: 'contoso devops',
      accessToken: 'short-lived-token',
    })

    await client.request('/_apis/projects?api-version=7.1')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dev.azure.com/contoso%20devops/_apis/projects?api-version=7.1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer short-lived-token',
        }),
      }),
    )
  })

  it('surfaces Azure DevOps error details and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'Project creation is not permitted.',
            typeKey: 'AccessDeniedException',
          }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    )
    const client = new AzureDevOpsClient({
      organizationName: 'contoso',
      accessToken: 'token',
    })

    const request = client.request('/_apis/projects', { method: 'POST' })

    await expect(request).rejects.toEqual(
      expect.objectContaining<Partial<AzureDevOpsRequestError>>({
        status: 403,
        typeKey: 'AccessDeniedException',
        message: 'Project creation is not permitted.',
      }),
    )
  })

  it('surfaces a plain-text Azure DevOps error body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('The repository must be empty before importing.', {
          status: 400,
        }),
      ),
    )
    const client = new AzureDevOpsClient({
      organizationName: 'contoso',
      accessToken: 'token',
    })

    await expect(client.request('/_apis/git/importRequests')).rejects.toEqual(
      expect.objectContaining<Partial<AzureDevOpsRequestError>>({
        status: 400,
        message: 'The repository must be empty before importing.',
      }),
    )
  })

  it('adds request context to browser-level fetch failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
    )
    const client = new AzureDevOpsClient({
      organizationName: 'contoso',
      accessToken: 'token',
    })

    await expect(
      client.request('/project/team/_apis/dashboard/dashboards', {
        method: 'POST',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AzureDevOpsNetworkError>>({
        method: 'POST',
        path: '/project/team/_apis/dashboard/dashboards',
        message:
          'Azure DevOps POST request to /project/team/_apis/dashboard/dashboards failed before a response was received. ' +
          "Verify the extension's approved scopes and network/CORS access. Failed to fetch",
      }),
    )
  })
})
