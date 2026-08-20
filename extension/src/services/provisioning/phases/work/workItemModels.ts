/**
 * JSON shapes for `WorkItems/&lt;Type&gt;.json` template assets and the Azure
 * DevOps work item REST responses, ported from the legacy
 * `ImportWorkItemModel`/`WorkItemPatchResponse` C# view models
 * (`src/API/Viewmodel/WorkItem`).
 */

/** A single `rel`/`url`/`attributes` entry from an exported work item's `relations` array. */
export interface WorkItemImportRelation {
  rel: string
  url: string
  attributes?: Record<string, string>
}

/** The `fields` bag of an exported work item, keyed by Azure DevOps reference name. */
export interface WorkItemImportFields {
  'System.AreaPath'?: string
  'System.TeamProject'?: string
  'System.IterationPath'?: string
  'System.WorkItemType'?: string
  'System.State': string
  'System.Reason': string
  'System.Title': string
  'System.Description'?: string | null
  'System.Tags'?: string | null
  'System.BoardLane'?: string | null
  'Microsoft.VSTS.Common.Priority'?: number
  'Microsoft.VSTS.Common.AcceptanceCriteria'?: string | null
  'Microsoft.VSTS.Scheduling.RemainingWork'?: number
  'Microsoft.VSTS.Scheduling.Effort'?: number
  'Microsoft.VSTS.TCM.Steps'?: string | null
  'Microsoft.VSTS.TCM.Parameters'?: string | null
  'Microsoft.VSTS.TCM.LocalDataSource'?: string | null
  'Microsoft.VSTS.TCM.AutomationStatus'?: string | null
}

/** One exported work item entry. */
export interface WorkItemImportValue {
  id: number
  rev: number
  fields: WorkItemImportFields
  relations: WorkItemImportRelation[] | null
  url: string
}

/** The full contents of a `WorkItems/&lt;Type&gt;.json` template asset. */
export interface WorkItemImportFile {
  count: number
  value: WorkItemImportValue[]
}

/** A single Azure DevOps JSON Patch operation, as sent to the work item create/update endpoint. */
export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove'
  path: string
  value?: unknown
}

/** The response body returned by a successful work item create/update PATCH call. */
export interface WorkItemPatchResponse {
  id: number
  rev: number
  url: string
}

/** A resolved old-to-new mapping for a single created work item. */
export interface WorkItemMapEntry {
  newId: string
  type: string
  url: string
}
