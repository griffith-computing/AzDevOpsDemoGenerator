import type { ProvisioningPhase } from '../../types'
import {
  hasAnyTeamFile,
  isDefaultTeam,
  loadTeamDefinitions,
  resolveTeamFolder,
  teamPath,
  teamsManifestPath,
} from './shared'

type BugsBehavior = 'off' | 'asRequirements' | 'asTasks'

interface TeamSettingTemplate {
  bugsBehavior?: BugsBehavior
  backlogVisibilities?: Record<string, boolean>
}

const teamSettingFileName = 'TeamSetting.json'

/**
 * Applies each team's `TeamSetting.json` (bugs behavior and backlog category
 * visibilities, i.e. whether the Epics backlog/board is enabled) via a PATCH to
 * teamsettings, mirroring the reference implementation's `EnableEpic` step.
 */
export const teamSettingsPhase: ProvisioningPhase = {
  id: 'organization-team-settings',
  label: 'Configure team settings',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) && hasAnyTeamFile(context.loader, teamSettingFileName),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    for (const team of teams) {
      const teamName = isDefaultTeam(team) ? state.defaultTeamName : team.name
      const folder = resolveTeamFolder(loader, team.name)
      const settingsPath = folder ? `${folder}/${teamSettingFileName}` : undefined
      if (!settingsPath || !loader.has(settingsPath)) {
        continue
      }

      const settings = await loader.json<TeamSettingTemplate>(settingsPath)
      await client.request(
        teamPath(state.projectId, teamName, '/_apis/work/teamsettings?api-version=7.1'),
        { method: 'PATCH', body: JSON.stringify(settings) },
        signal,
      )
    }
  },
}
