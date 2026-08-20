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
    const response = await fetch(`${this.getBaseUrl(host)}${path}`, {
      ...init,
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.context.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    })

    if (!response.ok) {
      let detail: AzureDevOpsErrorBody | undefined
      try {
        detail = (await response.json()) as AzureDevOpsErrorBody
      } catch {
        detail = undefined
      }

      throw new AzureDevOpsRequestError(
        response.status,
        detail?.message ??
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
