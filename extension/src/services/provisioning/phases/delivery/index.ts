import type { ProvisioningPhase } from '../../types'
import { buildDefinitionsPhase } from './buildDefinitions'
import { buildQueuePhase } from './buildQueue'
import { deliveryPlansPhase } from './deliveryPlans'
import { deploymentGroupsPhase } from './deploymentGroups'
import { releaseDefinitionsPhase } from './releaseDefinitions'
import { serviceEndpointsPhase } from './serviceEndpoints'
import { codeWikisPhase, projectWikiPhase } from './wikis'
import { variableGroupsPhase } from './variableGroups'

/**
 * Delivery-scope provisioning phases: service endpoints, variable groups,
 * deployment groups, build definitions (with an optional initial build
 * queue), release definitions, wikis, and delivery plans. Order matters —
 * each phase declares `dependsOn` for the phases (within this array) it
 * relies on, and the array order below keeps that dependency chain
 * readable top-to-bottom.
 */
export const deliveryPhases: ProvisioningPhase[] = [
  serviceEndpointsPhase,
  variableGroupsPhase,
  deploymentGroupsPhase,
  buildDefinitionsPhase,
  buildQueuePhase,
  releaseDefinitionsPhase,
  codeWikisPhase,
  projectWikiPhase,
  deliveryPlansPhase,
]

export { buildDefinitionsPhase } from './buildDefinitions'
export { buildQueuePhase } from './buildQueue'
export { deliveryPlansPhase } from './deliveryPlans'
export { deploymentGroupsPhase } from './deploymentGroups'
export { releaseDefinitionsPhase } from './releaseDefinitions'
export { serviceEndpointsPhase } from './serviceEndpoints'
export { codeWikisPhase, projectWikiPhase } from './wikis'
export { variableGroupsPhase } from './variableGroups'
