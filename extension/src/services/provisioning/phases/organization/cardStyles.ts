import type { ProvisioningPhase } from '../../types'
import {
  hasAnyTeamFile,
  isDefaultTeam,
  loadTeamDefinitions,
  resolveTeamFolder,
  teamBoardPath,
  teamsManifestPath,
} from './shared'

interface CardStyleClause {
  fieldName: string
  index: number
  logicalOperator: string
  operator: string
  value: string
}

interface CardStyleRule {
  name: string
  isEnabled: string
  filter: string
  clauses: CardStyleClause[]
  settings: Record<string, string>
}

interface CardStyleRules {
  fill?: CardStyleRule[]
  tagStyle?: unknown[]
}

interface CardStylesEntry {
  url?: string
  rules: CardStyleRules
  _links?: unknown
  BoardName: string
}

const cardStylesFileName = 'CardStyles.json'

/**
 * Applies each team's `CardStyles.json` per board via a PATCH of the board's card rule
 * settings, matching the reference implementation's `ApplyRules` step. Only entries whose
 * `rules.fill` is populated are sent: boards without conditional fill rules (typically
 * Epics/Features in the sample templates) intentionally have nothing to apply.
 */
export const cardStylesPhase: ProvisioningPhase = {
  id: 'organization-card-styles',
  label: 'Configure card styles',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) && hasAnyTeamFile(context.loader, cardStylesFileName),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    for (const team of teams) {
      const teamName = isDefaultTeam(team) ? state.defaultTeamName : team.name
      const folder = resolveTeamFolder(loader, team.name)
      const cardStylesPath = folder ? `${folder}/${cardStylesFileName}` : undefined
      if (!cardStylesPath || !loader.has(cardStylesPath)) {
        continue
      }

      const boards = await loader.json<CardStylesEntry[]>(cardStylesPath)
      for (const board of boards) {
        if (!board.rules.fill) {
          continue
        }

        await client.request(
          teamBoardPath(state.projectId, teamName, board.BoardName, '/cardrulesettings?api-version=7.1'),
          { method: 'PATCH', body: JSON.stringify({ rules: board.rules }) },
          signal,
        )
      }
    }
  },
}
