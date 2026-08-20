export interface CatalogTemplate {
  Key: string
  Name: string
  TemplateFolder: string
  ShortName?: string
  Description: string
  Tags?: string[]
  Author?: string
  Image?: string
  Message?: string
  group?: string
}

export interface CatalogGroup {
  Groups: string
  Template: CatalogTemplate[]
}

export interface ProvisioningRequest {
  projectName: string
  template: CatalogTemplate
  parameters: Record<string, string>
}

export type ProvisioningStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export interface ProvisioningEvent {
  stepId: string
  label: string
  status: ProvisioningStatus
  message?: string
}

export interface SdkContext {
  accessToken: string
  organizationName: string
}

export interface TemplateManifestEntry {
  files: string[]
  bundle: string
  capabilities: string[]
  requiredParameters: Array<{
    name: string
    secret: boolean
  }>
}
