import type { SdkContext } from '../types'

interface AzureDevOpsErrorBody {
  message?: string
  typeKey?: string
}

export type AzureDevOpsHost = 'core' | 'release' | 'graph'

export class AzureDevOpsRequestError extends Error {
  readonly status: number
  readonly typeKey?: string

  constructor(status: number, message: string, typeKey?: string) {
    super(message)
    this.name = 'AzureDevOpsRequestError'
    this.status = status
    this.typeKey = typeKey
  }
}

export class AzureDevOpsNetworkError extends Error {
  readonly method: string
  readonly path: string

  constructor(method: string, path: string, cause: unknown) {
    const detail = cause instanceof Error ? ` ${cause.message}` : ''
    super(
      `Azure DevOps ${method} request to ${path} failed before a response was received. ` +
        `Verify the extension's approved scopes and network/CORS access.${detail}`,
      { cause },
    )
    this.name = 'AzureDevOpsNetworkError'
    this.method = method
    this.path = path
  }
}

export class AzureDevOpsClient {
  private readonly organizationName: string
  private readonly context: SdkContext

  constructor(context: SdkContext) {
    this.context = context
    this.organizationName = encodeURIComponent(context.organizationName)
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    host: AzureDevOpsHost = 'core',
  ): Promise<T> {
    const method = init.method ?? 'GET'
    let response: Response
    try {
      response = await fetch(`${this.getBaseUrl(host)}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.context.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      })
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === 'AbortError')
      ) {
        throw error
      }
      throw new AzureDevOpsNetworkError(method, path, error)
    }

    if (!response.ok) {
      let detail: AzureDevOpsErrorBody | undefined
      let responseMessage: string | undefined
      try {
        const text = await response.text()
        if (text.trim()) {
          try {
            const parsed = JSON.parse(text) as unknown
            if (typeof parsed === 'string') {
              responseMessage = parsed
            } else if (parsed && typeof parsed === 'object') {
              detail = parsed as AzureDevOpsErrorBody
            }
          } catch {
            responseMessage = text.trim().slice(0, 2_000)
          }
        }
      } catch {
        detail = undefined
      }

      throw new AzureDevOpsRequestError(
        response.status,
        detail?.message ??
          responseMessage ??
          `Azure DevOps request failed with ${response.status} ${response.statusText}.`,
        detail?.typeKey,
      )
    }

    if (response.status === 204) {
      return undefined as T
    }

    return (await response.json()) as T
  }

  private getBaseUrl(host: AzureDevOpsHost): string {
    switch (host) {
      case 'release':
        return `https://vsrm.dev.azure.com/${this.organizationName}`
      case 'graph':
        return `https://vssps.dev.azure.com/${this.organizationName}`
      default:
        return `https://dev.azure.com/${this.organizationName}`
    }
  }
}
