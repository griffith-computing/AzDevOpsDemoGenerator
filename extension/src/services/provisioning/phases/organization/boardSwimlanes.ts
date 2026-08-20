import type { ProvisioningPhase } from '../../types'
import {
  hasAnyTeamFile,
  isDefaultTeam,
  loadTeamDefinitions,
  resolveTeamFolder,
  teamBoardPath,
  teamsManifestPath,
} from './shared'

interface BoardRowTemplate {
  id?: string
  name: string | null
}

interface BoardRowsFile {
  BoardName: string
  value: BoardRowTemplate[]
}

const boardRowsFileName = 'BoardRows.json'

/**
 * Applies each team's `BoardRows.json` (swimlanes) per board via a full PUT of the row
 * list, matching the reference implementation.
 */
export const boardSwimlanesPhase: ProvisioningPhase = {
  id: 'organization-board-swimlanes',
  label: 'Configure board swimlanes',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) && hasAnyTeamFile(context.loader, boardRowsFileName),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    for (const team of teams) {
      const teamName = isDefaultTeam(team) ? state.defaultTeamName : team.name
      const folder = resolveTeamFolder(loader, team.name)
      const boardRowsPath = folder ? `${folder}/${boardRowsFileName}` : undefined
      if (!boardRowsPath || !loader.has(boardRowsPath)) {
        continue
      }

      const boards = await loader.json<BoardRowsFile[]>(boardRowsPath)
      for (const board of boards) {
        await client.request(
          teamBoardPath(state.projectId, teamName, board.BoardName, '/rows?api-version=7.1'),
          { method: 'PUT', body: JSON.stringify(board.value) },
          signal,
        )
      }
    }
  },
}
