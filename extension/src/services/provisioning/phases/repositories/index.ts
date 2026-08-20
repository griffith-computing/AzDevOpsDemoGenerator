import type { ProvisioningPhase } from '../../types'
import { branchPoliciesPhase } from './branchPolicies'
import { pullRequestsPhase } from './pullRequests'
import { repositoriesPhase } from './repositories'
import { sourceImportsPhase } from './sourceImports'

export const repositoryPhases: ProvisioningPhase[] = [
  repositoriesPhase,
  sourceImportsPhase,
  pullRequestsPhase,
  branchPoliciesPhase,
]

export { branchPoliciesPhase } from './branchPolicies'
export { pullRequestsPhase } from './pullRequests'
export { repositoriesPhase } from './repositories'
export { sourceImportsPhase } from './sourceImports'
