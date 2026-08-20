import type { ProvisioningPhase } from '../types'
import {
  buildDefinitionsPhase,
  buildQueuePhase,
  codeWikisPhase,
  deliveryPlansPhase,
  deploymentGroupsPhase,
  projectWikiPhase,
  releaseDefinitionsPhase,
  serviceEndpointsPhase,
  variableGroupsPhase,
} from './delivery'
import { organizationPhases } from './organization'
import {
  branchPoliciesPhase,
  pullRequestsPhase,
  repositoriesPhase,
  sourceImportsPhase,
} from './repositories'
import {
  dashboardsPhase,
  sharedQueriesPhase,
  testPlansPhase,
  workItemsPhase,
} from './work'

export const provisioningPhases: ProvisioningPhase[] = [
  ...organizationPhases,
  serviceEndpointsPhase,
  variableGroupsPhase,
  deploymentGroupsPhase,
  repositoriesPhase,
  sourceImportsPhase,
  pullRequestsPhase,
  workItemsPhase,
  sharedQueriesPhase,
  testPlansPhase,
  buildDefinitionsPhase,
  buildQueuePhase,
  releaseDefinitionsPhase,
  codeWikisPhase,
  projectWikiPhase,
  deliveryPlansPhase,
  branchPoliciesPhase,
  dashboardsPhase,
]
