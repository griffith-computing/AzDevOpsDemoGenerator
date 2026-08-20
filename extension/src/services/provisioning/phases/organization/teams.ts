import type { ProvisioningPhase } from '../../types'
import {
  isDefaultTeam,
  loadTeamDefinitions,
  projectPath,
  teamPath,
  teamsManifestPath,
} from './shared'

interface CreatedTeam {
  id: string
  name: string
}

interface TeamSettingsResponse {
  backlogIteration?: { id?: string }
}

/** A root/child node from the WIT classification nodes API, as needed to enumerate sprints. */
interface IterationNode {
  identifier: string
  name: string
  children?: IterationNode[]
}

/**
 * Creates the additional (non-default) teams declared in `Teams/Teams.json`, then aligns
 * each new team's backlog iteration and sprint set with the project's default team so the
 * new teams are immediately usable for sprint planning.
 *
 * The default team already exists from project creation and is left untouched here; area
 * and board customization for every team (default included) are handled by later phases.
 */
export const teamsPhase: ProvisioningPhase = {
  id: 'organization-teams',
  label: 'Create additional teams',
  dependsOn: ['organization-iterations'],
  isApplicable: (context) => context.loader.has(teamsManifestPath),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)
    const additionalTeams = teams.filter((team) => !isDefaultTeam(team))
    if (additionalTeams.length === 0) {
      return
    }

    const defaultTeamSettings = await client.request<TeamSettingsResponse>(
      teamPath(state.projectId, state.defaultTeamName, '/_apis/work/teamsettings?api-version=7.1'),
      {},
      signal,
    )
    const backlogIterationId = defaultTeamSettings.backlogIteration?.id

    const rootIterations = await client.request<IterationNode>(
      projectPath(state.projectId, '/_apis/wit/classificationnodes/iterations?$depth=1&api-version=7.1'),
      {},
      signal,
    )
    const sprintIdentifiers = (rootIterations.children ?? []).map((node) => node.identifier)

    for (const team of additionalTeams) {
      const created = await client.request<CreatedTeam>(
        `/_apis/projects/${encodeURIComponent(state.projectId)}/teams?api-version=7.1`,
        {
          method: 'POST',
          body: JSON.stringify({ name: team.name, description: team.description ?? '' }),
        },
        signal,
      )

      if (backlogIterationId) {
        await client.request(
          teamPath(state.projectId, created.name, '/_apis/work/teamsettings?api-version=7.1'),
          { method: 'PATCH', body: JSON.stringify({ backlogIteration: backlogIterationId }) },
          signal,
        )
      }

      for (const identifier of sprintIdentifiers) {
        await client.request(
          teamPath(state.projectId, created.name, '/_apis/work/teamsettings/iterations?api-version=7.1'),
          { method: 'POST', body: JSON.stringify({ id: identifier }) },
          signal,
        )
      }
    }
  },
}
