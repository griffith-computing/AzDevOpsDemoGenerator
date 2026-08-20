import * as SDK from 'azure-devops-extension-sdk'
import type { SdkContext } from '../types'

export async function createSdkContext(): Promise<SdkContext> {
  const [accessToken, host] = await Promise.all([
    SDK.getAccessToken(),
    Promise.resolve(SDK.getHost()),
  ])

  if (!host.name) {
    throw new Error('Azure DevOps organization context is unavailable.')
  }

  return {
    accessToken,
    organizationName: host.name,
  }
}
