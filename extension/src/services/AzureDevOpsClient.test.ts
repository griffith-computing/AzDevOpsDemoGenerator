import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AzureDevOpsClient,
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
})
