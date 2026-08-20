import type { ProvisioningPhase } from '../../types'
import { applyTemplateValues } from '../../templateValues'
import {
  isDefaultTeam,
  loadTeamDefinitions,
  projectPath,
  resolveTeamFolder,
  teamAreaManifestPath,
  teamPath,
  teamsManifestPath,
} from './shared'

interface TeamFieldValueEntry {
  value: string
  includeChildren: boolean
}

interface TeamFieldValues {
  defaultValue: string
  values: TeamFieldValueEntry[]
}

const includeSubAreasFileName = 'IncludeSubAreas.json'

/**
 * Creates an area path per additional team and assigns each team's default area using
 * `TeamArea.json` (`$ProjectName$\$AreaName$` tokens). Any team folder that also ships an
 * `IncludeSubAreas.json` gets its team field values re-applied, forced to the project's own
 * area with children included, matching the reference implementation which treats the
 * template file's literal values as placeholders and always substitutes the live project
 * name at provisioning time.
 */
export const areasPhase: ProvisioningPhase = {
  id: 'organization-areas',
  label: 'Configure team areas',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) &&
    (context.loader.has(teamAreaManifestPath) ||
      context.loader.entry.files.some((file) => file.toLowerCase().endsWith(`/${includeSubAreasFileName.toLowerCase()}`))),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    const teamAreaTemplate = loader.has(teamAreaManifestPath)
      ? await loader.json<TeamFieldValues>(teamAreaManifestPath)
      : undefined

    for (const team of teams) {
      const isDefault = isDefaultTeam(team)
      const teamName = isDefault ? state.defaultTeamName : team.name

      if (!isDefault && teamAreaTemplate) {
        await client.request<{ name: string }>(
          projectPath(state.projectId, '/_apis/wit/classificationnodes/areas?api-version=7.1'),
          { method: 'POST', body: JSON.stringify({ name: team.name }) },
          signal,
        )

        state.values.set('AreaName', team.name)
        const payload = applyTemplateValues(teamAreaTemplate, state)
        await client.request(
          teamPath(state.projectId, teamName, '/_apis/work/teamsettings/teamfieldvalues?api-version=7.1'),
          { method: 'PATCH', body: JSON.stringify(payload) },
          signal,
        )
      }

      const folder = resolveTeamFolder(loader, team.name)
      const includeSubAreasPath = folder ? `${folder}/${includeSubAreasFileName}` : undefined
      if (includeSubAreasPath && loader.has(includeSubAreasPath)) {
        const includeSubAreas = await loader.json<TeamFieldValues>(includeSubAreasPath)
        const firstValue = includeSubAreas.values[0]
        if (firstValue) {
          firstValue.value = state.projectName
          firstValue.includeChildren = true
        }
        includeSubAreas.defaultValue = state.projectName

        await client.request(
          teamPath(state.projectId, teamName, '/_apis/work/teamsettings/teamfieldvalues?api-version=7.1'),
          { method: 'PATCH', body: JSON.stringify(includeSubAreas) },
          signal,
        )
      }
    }
  },
}
