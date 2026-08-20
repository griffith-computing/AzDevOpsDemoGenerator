import type { ProvisioningPhase } from '../../types'
import { workItemsPhase } from './workItemsPhase'
import { sharedQueriesPhase } from './sharedQueriesPhase'
import { testPlansPhase } from './testPlansPhase'
import { dashboardsPhase } from './dashboardsPhase'

/**
 * Browser-side provisioning phases covering work items (and their relations),
 * shared queries, test plans/suites, and dashboards/widgets, ported from
 * `src/API/WorkItemAndTracking`, `src/API/QueriesAndWidgets`,
 * `src/API/TestManagement`, and `src/ADOGenerator/Services/ProjectService.cs`.
 *
 * Order matters: `runPhases` requires each phase's `dependsOn` entries to
 * have already completed, so `workItemsPhase` (id `work-items`) precedes
 * `testPlansPhase` (`dependsOn: ['work-items']`), and `sharedQueriesPhase`
 * (id `work-shared-queries`) precedes `dashboardsPhase`
 * (`dependsOn: ['work-shared-queries']`).
 */
export const workPhases: ProvisioningPhase[] = [
  workItemsPhase,
  sharedQueriesPhase,
  testPlansPhase,
  dashboardsPhase,
]

export { dashboardsPhase } from './dashboardsPhase'
export { sharedQueriesPhase } from './sharedQueriesPhase'
export { testPlansPhase } from './testPlansPhase'
export { workItemsPhase } from './workItemsPhase'
