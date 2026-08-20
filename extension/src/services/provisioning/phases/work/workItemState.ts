import type { ProvisioningContext } from '../../types'
import type { WorkItemMapEntry } from './workItemModels'

/**
 * Key under which the deterministic old-to-new work item id map is stored in
 * `context.state.values`, so later phases (test plans, and any future
 * consumer) can resolve old numeric ids without recomputing them.
 *
 * The map itself (not its individual entries) is stored as a single value,
 * since `ProvisioningState.values` only special-cases primitives for
 * `applyTemplateValues` token substitution (see `../../templateValues.ts`) -
 * numeric work item ids can never match that helper's letter-first token
 * pattern, so nothing is lost by keeping the map out of the flat token space.
 */
const workItemMapStateKey = 'work.workItemIdMap'

/** Reads the work item id map populated by `workItemsPhase`, or an empty map if it has not run. */
export function getWorkItemIdMap(context: ProvisioningContext): Map<string, WorkItemMapEntry> {
  const stored = context.state.values.get(workItemMapStateKey)
  return stored instanceof Map ? (stored as Map<string, WorkItemMapEntry>) : new Map()
}

/** Stores the work item id map built by `workItemsPhase`. */
export function setWorkItemIdMap(
  context: ProvisioningContext,
  map: Map<string, WorkItemMapEntry>,
): void {
  context.state.values.set(workItemMapStateKey, map)
}
