import type { ProvisioningPhase } from '../../types'
import {
  hasAnyTeamFile,
  isDefaultTeam,
  loadTeamDefinitions,
  resolveTeamFolder,
  teamBoardPath,
  teamsManifestPath,
} from './shared'

interface CardFieldEntry {
  fieldIdentifier?: string
  displayFormat?: string
  displayType?: string
  showEmptyFields?: string
}

interface CardFieldsFile {
  BoardName: string
  cards: Record<string, CardFieldEntry[]>
}

const cardFieldsFileName = 'CardFields.json'

/**
 * Applies each team's `CardFields.json` per board via a full PUT of the board's card
 * settings, matching the reference implementation's `UpdateCardField` step.
 */
export const cardFieldsPhase: ProvisioningPhase = {
  id: 'organization-card-fields',
  label: 'Configure card fields',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) && hasAnyTeamFile(context.loader, cardFieldsFileName),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    for (const team of teams) {
      const teamName = isDefaultTeam(team) ? state.defaultTeamName : team.name
      const folder = resolveTeamFolder(loader, team.name)
      const cardFieldsPath = folder ? `${folder}/${cardFieldsFileName}` : undefined
      if (!cardFieldsPath || !loader.has(cardFieldsPath)) {
        continue
      }

      const boards = await loader.json<CardFieldsFile[]>(cardFieldsPath)
      for (const board of boards) {
        await client.request(
          teamBoardPath(state.projectId, teamName, board.BoardName, '/cardsettings?api-version=7.1'),
          { method: 'PUT', body: JSON.stringify({ cards: board.cards }) },
          signal,
        )
      }
    }
  },
}
