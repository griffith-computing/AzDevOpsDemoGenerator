import { applyTemplateValues } from '../../templateValues'
import type { ProvisioningPhase } from '../../types'
import type { ProjectReference } from './shared'
import { assertNoUnresolvedPlaceholders } from './shared'

const variableGroupsManifestPath = 'VariableGroups/VariableGroup.json'

interface VariableValue {
  value?: string
  isSecret?: boolean
}

interface VariableGroupTemplate {
  id?: string | number
  type?: string
  name: string
  isShared?: boolean
  variables: Record<string, VariableValue>
}

interface VariableGroupsTemplate {
  count: number
  value: VariableGroupTemplate[]
}

interface VariableGroupProjectReference {
  name: string
  projectReference: ProjectReference
}

interface CreateVariableGroupBody {
  type?: string
  name: string
  variables: Record<string, VariableValue>
  variableGroupProjectReferences: VariableGroupProjectReference[]
}

interface VariableGroup {
  id: number
  name: string
}

/**
 * Creates the variable groups declared in `VariableGroups/VariableGroup.json`,
 * populating `context.state.variableGroupIds` for later phases (release
 * definitions reference a group by `$<groupname>$`).
 *
 * The current variable groups API requires a `variableGroupProjectReferences`
 * entry identifying which project the group belongs to; the legacy template
 * JSON predates that requirement, so it is synthesized here. The template's
 * own placeholder `id` is dropped — Azure DevOps assigns the real id.
 *
 * Variable group templates in the catalog are fully static (no `$Token$`
 * placeholders) and some intentionally ship demo `isSecret: true` values
 * (e.g. a fake sandbox API key) as committed sample content; those are
 * template data, not credentials this tool must source, so they are sent
 * through unchanged. `assertNoUnresolvedPlaceholders` still guards against a
 * future template that does add a placeholder token.
 */
export const variableGroupsPhase: ProvisioningPhase = {
  id: 'variable-groups',
  label: 'Create variable groups',
  isApplicable: (context) => context.loader.has(variableGroupsManifestPath),
  run: async (context) => {
    const { client, loader, state, signal } = context

    const raw = await loader.json<VariableGroupsTemplate>(variableGroupsManifestPath)
    const resolved = applyTemplateValues(raw, state)

    for (const group of resolved.value) {
      assertNoUnresolvedPlaceholders(group, `Variable group "${group.name}"`)

      const body: CreateVariableGroupBody = {
        type: group.type,
        name: group.name,
        variables: group.variables,
        variableGroupProjectReferences: [
          {
            name: group.name,
            projectReference: { id: state.projectId, name: state.projectName },
          },
        ],
      }

      const created = await client.request<VariableGroup>(
        '/_apis/distributedtask/variablegroups?api-version=7.1',
        { method: 'POST', body: JSON.stringify(body) },
        signal,
      )

      state.variableGroupIds.set(created.name, created.id)
    }
  },
}
