import type { ProvisioningContext, ProvisioningPhase } from '../../types'
import { applyTemplateValues } from '../../templateValues'
import { buildFieldOperations, supportedRelationTypes } from './workItemFields'
import type {
  JsonPatchOperation,
  WorkItemImportFile,
  WorkItemImportValue,
  WorkItemMapEntry,
  WorkItemPatchResponse,
} from './workItemModels'
import { setWorkItemIdMap } from './workItemState'

const workItemsDirectory = 'WorkItems'

interface ParsedWorkItemFile {
  workItemType: string
  data: WorkItemImportFile
}

/**
 * Creates every work item declared under `WorkItems/&lt;Type&gt;.json`, then
 * re-creates the relations recorded on those exported items, ported from
 * `ImportWorkitems`/`PrepareAndUpdateTarget`/`UpdateWorkItemLinks` in
 * `src/API/WorkItemAndTracking/ImportWorkItems.cs`.
 *
 * Work items are created in a deterministic order (template file name, then
 * original numeric id) across a first pass so that every old id has a
 * resolved new id before the second pass creates any relation - Azure DevOps
 * requires both endpoints of a link to already exist. The resulting
 * old-to-new id map is stored via `setWorkItemIdMap` for `testPlansPhase` to
 * resolve `TestCases`/`requirementIds` references.
 *
 * `AttachedFile` relations are intentionally not recreated: they reference
 * attachment blobs on the source organization, and a browser-side
 * provisioning request (`ProvisioningRequest`) carries no file payload to
 * re-upload. `ArtifactLink` relations are intentionally not recreated either:
 * they require repository/pull-request ids that are only known to sibling
 * phases outside `phases/work/`, which this phase does not depend on.
 */
export const workItemsPhase: ProvisioningPhase = {
  id: 'work-items',
  label: 'Create work items',
  isApplicable: (context) => context.loader.filesUnder(workItemsDirectory).length > 0,
  async run(context) {
    const { loader, state } = context
    const files = [...context.loader.filesUnder(workItemsDirectory)].sort((a, b) =>
      a.localeCompare(b),
    )

    const parsedFiles: ParsedWorkItemFile[] = []
    for (const file of files) {
      const raw = await loader.json<WorkItemImportFile>(file)
      parsedFiles.push({
        workItemType: workItemTypeFromFile(file),
        data: applyTemplateValues(raw, state),
      })
    }

    const idMap = new Map<string, WorkItemMapEntry>()
    let workItemUrlPrefix: string | undefined

    for (const { workItemType, data } of parsedFiles) {
      for (const item of data.value) {
        const response = await createWorkItem(context, workItemType, item)
        workItemUrlPrefix ??= workItemUrlPrefixFromResponseUrl(response.url)
        idMap.set(String(item.id), {
          newId: String(response.id),
          type: workItemType,
          url: response.url,
        })
      }
    }

    setWorkItemIdMap(context, idMap)

    if (!workItemUrlPrefix) {
      return
    }

    for (const { data } of parsedFiles) {
      for (const item of data.value) {
        if (!item.relations || item.relations.length === 0) {
          continue
        }

        const sourceEntry = idMap.get(String(item.id))
        if (!sourceEntry) {
          throw new Error(
            `Work item ${item.id} was not created before its relations were processed.`,
          )
        }

        for (const relation of item.relations) {
          const relationType = relation.rel.trim()
          if (supportedRelationTypes.has(relationType)) {
            const targetOldId = relation.url.slice(relation.url.lastIndexOf('/') + 1)
            const targetEntry = idMap.get(targetOldId)
            if (!targetEntry) {
              throw new Error(
                `Relation target work item ${targetOldId} referenced by work item ${item.id} was not created.`,
              )
            }
            await addRelation(
              context,
              sourceEntry.newId,
              relationType,
              `${workItemUrlPrefix}/${targetEntry.newId}`,
              'Making a new link for the dependency',
            )
          } else if (relationType === 'Hyperlink') {
            // External URL, needs no id resolution.
            await addRelation(context, sourceEntry.newId, relationType, relation.url)
          }
        }
      }
    }
  },
}

function workItemTypeFromFile(file: string): string {
  const fileName = file.split('/').pop()
  if (!fileName) {
    throw new Error(`Could not determine a work item type from template asset "${file}".`)
  }
  return fileName.replace(/\.json$/iu, '')
}

/** Derives the org-level work item resource prefix from a just-created item's own `url`. */
function workItemUrlPrefixFromResponseUrl(url: string): string {
  return url.slice(0, url.lastIndexOf('/'))
}

async function createWorkItem(
  context: ProvisioningContext,
  workItemType: string,
  item: WorkItemImportValue,
): Promise<WorkItemPatchResponse> {
  const { client, state, signal } = context
  const operations = buildFieldOperations(workItemType, item.fields, state.projectName)

  return client.request<WorkItemPatchResponse>(
    // The literal `$` prefix is part of the URL path syntax for the create
    // endpoint and must not be percent-encoded; only the type name is.
    `/${encodeURIComponent(state.projectId)}/_apis/wit/workitems/$${encodeURIComponent(
      workItemType,
    )}?bypassRules=true&api-version=7.1`,
    {
      method: 'PATCH',
      // The work item PATCH endpoint requires the JSON Patch media type;
      // the client's default `application/json` must be overridden explicitly.
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify(operations),
    },
    signal,
  )
}

async function addRelation(
  context: ProvisioningContext,
  newWorkItemId: string,
  rel: string,
  url: string,
  comment?: string,
): Promise<void> {
  const { client, state, signal } = context
  const operation: JsonPatchOperation = {
    op: 'add',
    path: '/relations/-',
    value: comment ? { rel, url, attributes: { comment } } : { rel, url },
  }

  await client.request<WorkItemPatchResponse>(
    `/${encodeURIComponent(state.projectId)}/_apis/wit/workitems/${encodeURIComponent(
      newWorkItemId,
    )}?bypassRules=true&api-version=7.1`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json-patch+json' },
      body: JSON.stringify([operation]),
    },
    signal,
  )
}
