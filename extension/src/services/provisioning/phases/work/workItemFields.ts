import type { JsonPatchOperation, WorkItemImportFields } from './workItemModels'

/**
 * Azure DevOps relation directions that `workItemsPhase` re-creates on the
 * target project, ported verbatim from the legacy `relTypes` allow-list in
 * `src/API/WorkItemAndTracking/ImportWorkItems.cs`. Only one direction of
 * each reciprocal pair is listed: Azure DevOps automatically creates the
 * opposite-direction link when one direction is added (e.g. adding
 * `System.LinkTypes.Hierarchy-Forward` on the parent auto-creates
 * `-Reverse` on the child), so processing both directions would attempt to
 * create the same link twice.
 */
export const supportedRelationTypes: ReadonlySet<string> = new Set([
  'Microsoft.VSTS.Common.TestedBy-Reverse',
  'System.LinkTypes.Hierarchy-Forward',
  'System.LinkTypes.Related',
  'System.LinkTypes.Dependency-Reverse',
  'System.LinkTypes.Dependency-Forward',
])

/**
 * Builds the JSON Patch field operations for one work item, mirroring
 * `PrepareAndUpdateTarget` in `ImportWorkItems.cs`. Test Case work items use a
 * distinct field set (TCM steps/parameters instead of area/iteration path);
 * every other type uses the general field set.
 *
 * Deliberately not ported (no equivalent data available to a browser-side
 * provisioning phase): `System.AssignedTo` (legacy assigns a random member
 * from a configured team-member list), the configurable board-row field, and
 * the `Task` type's randomized `System.CreatedDate` jitter (both would
 * conflict with deterministic, reproducible provisioning).
 */
export function buildFieldOperations(
  workItemType: string,
  fields: WorkItemImportFields,
  projectName: string,
): JsonPatchOperation[] {
  return workItemType === 'Test Case'
    ? buildTestCaseFieldOperations(fields)
    : buildStandardFieldOperations(fields, projectName)
}

function buildTestCaseFieldOperations(fields: WorkItemImportFields): JsonPatchOperation[] {
  const operations: JsonPatchOperation[] = [
    { op: 'add', path: '/fields/System.Title', value: fields['System.Title'] },
    { op: 'add', path: '/fields/System.State', value: fields['System.State'] },
    { op: 'add', path: '/fields/System.Reason', value: fields['System.Reason'] },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: fields['Microsoft.VSTS.Common.Priority'],
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.Steps',
      // Creation fails when these TCM fields are null, so an empty string
      // stands in for "no steps/parameters/data source" (matches legacy).
      value: fields['Microsoft.VSTS.TCM.Steps'] ?? '',
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.Parameters',
      value: fields['Microsoft.VSTS.TCM.Parameters'] ?? '',
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.LocalDataSource',
      value: fields['Microsoft.VSTS.TCM.LocalDataSource'] ?? '',
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.AutomationStatus',
      value: fields['Microsoft.VSTS.TCM.AutomationStatus'] ?? '',
    },
  ]

  if (fields['Microsoft.VSTS.Common.AcceptanceCriteria'] != null) {
    operations.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
    })
  }

  if (fields['System.Tags'] != null) {
    operations.push({ op: 'add', path: '/fields/System.Tags', value: fields['System.Tags'] })
  }

  operations.push({
    op: 'add',
    path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork',
    value: fields['Microsoft.VSTS.Scheduling.RemainingWork'],
  })

  return operations
}

function buildStandardFieldOperations(
  fields: WorkItemImportFields,
  projectName: string,
): JsonPatchOperation[] {
  const iterationPath = normalizeProjectScopedPath(fields['System.IterationPath'], projectName, {
    keepSecondSegmentOnly: true,
  })
  const areaPath = normalizeProjectScopedPath(fields['System.AreaPath'], projectName, {
    keepSecondSegmentOnly: false,
  })
  const description = fields['System.Description'] ?? fields['System.Title']

  const operations: JsonPatchOperation[] = [
    { op: 'add', path: '/fields/System.Title', value: fields['System.Title'] },
    { op: 'add', path: '/fields/System.AreaPath', value: areaPath },
    { op: 'add', path: '/fields/System.Description', value: description },
    { op: 'add', path: '/fields/System.State', value: fields['System.State'] },
    { op: 'add', path: '/fields/System.Reason', value: fields['System.Reason'] },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.Priority',
      value: fields['Microsoft.VSTS.Common.Priority'],
    },
    { op: 'add', path: '/fields/System.IterationPath', value: iterationPath },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Scheduling.RemainingWork',
      value: fields['Microsoft.VSTS.Scheduling.RemainingWork'],
    },
    {
      op: 'add',
      path: '/fields/Microsoft.VSTS.Scheduling.Effort',
      value: fields['Microsoft.VSTS.Scheduling.Effort'],
    },
  ]

  if (fields['Microsoft.VSTS.Common.AcceptanceCriteria'] != null) {
    operations.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
      value: fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
    })
  }

  if (fields['System.Tags'] != null) {
    operations.push({ op: 'add', path: '/fields/System.Tags', value: fields['System.Tags'] })
  }

  if (fields['Microsoft.VSTS.TCM.Parameters'] != null) {
    operations.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.Parameters',
      value: fields['Microsoft.VSTS.TCM.Parameters'],
    })
  }

  if (fields['Microsoft.VSTS.TCM.Steps'] != null) {
    operations.push({
      op: 'add',
      path: '/fields/Microsoft.VSTS.TCM.Steps',
      value: fields['Microsoft.VSTS.TCM.Steps'],
    })
  }

  return operations
}

/**
 * Rewrites the first path segment of an Area/Iteration path to the new
 * project name, since exported templates hard-code the source project's
 * classification tree (`applyTemplateValues` already substitutes
 * `$ProjectName$`-style tokens for newer templates, but older templates
 * embed a literal old project name that this normalization overwrites).
 *
 * When `keepSecondSegmentOnly` is set (iteration paths), anything beyond the
 * second segment is discarded, matching `PrepareAndUpdateTarget`'s
 * `iterationPath = "{projectName}\{originalParts[1]}"` behavior exactly.
 */
function normalizeProjectScopedPath(
  path: string | undefined,
  projectName: string,
  options: { keepSecondSegmentOnly: boolean },
): string {
  const original = path ?? projectName
  const segments = original.split('\\')

  if (options.keepSecondSegmentOnly) {
    return segments.length > 1 ? `${projectName}\\${segments[1]}` : projectName
  }

  segments[0] = projectName
  return segments.join('\\')
}
