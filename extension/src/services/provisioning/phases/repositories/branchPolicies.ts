import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningContext, ProvisioningPhase } from '../../types'

interface PolicyTypeReference {
  id: string
  url?: string
  displayName: string
}

interface PolicyTypesResponse {
  count: number
  value: PolicyTypeReference[]
}

interface BranchPolicyTemplate {
  isEnabled: boolean
  isBlocking: boolean
  isDeleted: boolean
  isEnterpriseManaged: boolean
  settings: Record<string, unknown>
  type: PolicyTypeReference
}

interface PolicyConfiguration {
  id: number
}

interface BuildDefinitionReference {
  id: number
}

interface BuildDefinitionsListResponse {
  count: number
  value: BuildDefinitionReference[]
}

interface BuildDefinitionProcess {
  yamlFilename?: string
}

interface BuildDefinition {
  id: number
  process?: BuildDefinitionProcess
}

/**
 * Applies the branch policies declared under the template's `BranchPolicy`
 * folder (searched recursively, matching how the legacy tool walks that
 * directory) to the repositories created by the `repositories` phase.
 */
export const branchPoliciesPhase: ProvisioningPhase = {
  id: 'branch-policies',
  label: 'Create branch policies',
  dependsOn: ['source-imports', 'build-definitions'],
  isApplicable: (context) => context.loader.filesUnder('BranchPolicy').length > 0,
  run: async (context) => {
    const { client, loader, state, signal } = context
    const files = loader.filesUnder('BranchPolicy')

    const policyTypes = await client.request<PolicyTypesResponse>(
      `/${encodeURIComponent(state.projectId)}/_apis/policy/types?api-version=7.1`,
      {},
      signal,
    )

    let yamlBuildDefinitionId: number | undefined

    for (const file of files) {
      const raw = await loader.json<BranchPolicyTemplate>(file)

      const policyType = policyTypes.value.find(
        (candidate) => candidate.displayName === raw.type.displayName,
      )
      if (!policyType) {
        throw new Error(
          `Branch policy "${file}" references unknown policy type "${raw.type.displayName}".`,
        )
      }
      state.values.set('policyTypeId', policyType.id)
      state.values.set('policyTypeUrl', policyType.url ?? '')

      if ('buildDefinitionId' in raw.settings) {
        if (yamlBuildDefinitionId === undefined) {
          yamlBuildDefinitionId = await findYamlBuildDefinitionId(context)
        }
        state.values.set('buildDefId', String(yamlBuildDefinitionId))
      }

      const resolved = applyTemplateValues(raw, state)
      await client.request<PolicyConfiguration>(
        `/${encodeURIComponent(state.projectId)}/_apis/policy/configurations?api-version=7.1`,
        { method: 'POST', body: JSON.stringify(resolved) },
        signal,
      )
    }
  },
}

/**
 * Finds the id of a YAML-based build definition to use as a build policy's
 * `buildDefinitionId`. Mirrors the legacy tool: scans every build
 * definition in the project and keeps the last one whose process reports a
 * `yamlFilename`.
 */
async function findYamlBuildDefinitionId(context: ProvisioningContext): Promise<number> {
  const { client, state, signal } = context

  const list = await client.request<BuildDefinitionsListResponse>(
    `/${encodeURIComponent(state.projectId)}/_apis/build/definitions?api-version=7.1`,
    {},
    signal,
  )

  let found: number | undefined
  for (const summary of list.value) {
    const detail = await client.request<BuildDefinition>(
      `/${encodeURIComponent(state.projectId)}/_apis/build/definitions/${encodeURIComponent(
        String(summary.id),
      )}?api-version=7.1`,
      {},
      signal,
    )
    if (detail.process?.yamlFilename) {
      found = detail.id
    }
  }

  if (found === undefined) {
    throw new Error(
      'This branch policy requires a YAML build definition, but the project has none. Create a ' +
        'YAML pipeline build definition before applying this template.',
    )
  }

  return found
}
