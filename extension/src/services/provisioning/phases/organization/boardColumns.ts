import type { ProvisioningPhase } from '../../types'
import {
  hasAnyTeamFile,
  isDefaultTeam,
  loadTeamDefinitions,
  resolveTeamFolder,
  teamBoardPath,
  teamsManifestPath,
} from './shared'

interface BoardColumnTemplate {
  id?: string
  name: string
  itemLimit?: number
  isSplit?: boolean
  description?: string
  columnType: 'incoming' | 'inProgress' | 'outgoing'
  stateMappings?: Record<string, string>
}

interface BoardColumnsFile {
  BoardName: string
  value: BoardColumnTemplate[]
}

interface CurrentBoardColumn {
  id: string
  columnType: 'incoming' | 'inProgress' | 'outgoing'
}

interface CurrentBoardResponse {
  columns?: CurrentBoardColumn[]
}

const boardColumnsFileName = 'BoardColumns.json'

/**
 * Applies each team's `BoardColumns.json` per board (Epics/Features/Stories/etc.) via a
 * full PUT of the column list. The board's boundary columns (`incoming`/`outgoing`) cannot
 * be recreated with new ids, so their current ids are fetched first and merged onto the
 * template's columns before the replace, matching the reference implementation.
 */
export const boardColumnsPhase: ProvisioningPhase = {
  id: 'organization-board-columns',
  label: 'Configure board columns',
  dependsOn: ['organization-teams'],
  isApplicable: (context) =>
    context.loader.has(teamsManifestPath) && hasAnyTeamFile(context.loader, boardColumnsFileName),
  async run(context) {
    const { client, loader, state, signal } = context
    const teams = await loadTeamDefinitions(loader)

    for (const team of teams) {
      const teamName = isDefaultTeam(team) ? state.defaultTeamName : team.name
      const folder = resolveTeamFolder(loader, team.name)
      const boardColumnsPath = folder ? `${folder}/${boardColumnsFileName}` : undefined
      if (!boardColumnsPath || !loader.has(boardColumnsPath)) {
        continue
      }

      const boards = await loader.json<BoardColumnsFile[]>(boardColumnsPath)
      for (const board of boards) {
        const current = await client.request<CurrentBoardResponse>(
          teamBoardPath(state.projectId, teamName, board.BoardName, '?api-version=7.1'),
          {},
          signal,
        )

        const incomingId = current.columns?.find((column) => column.columnType === 'incoming')?.id
        const outgoingId = current.columns?.find((column) => column.columnType === 'outgoing')?.id

        const columns = board.value.map((column) => {
          if (column.columnType === 'incoming' && incomingId) {
            return { ...column, id: incomingId }
          }
          if (column.columnType === 'outgoing' && outgoingId) {
            return { ...column, id: outgoingId }
          }
          return column
        })

        await client.request(
          teamBoardPath(state.projectId, teamName, board.BoardName, '/columns?api-version=7.1'),
          { method: 'PUT', body: JSON.stringify(columns) },
          signal,
        )
      }
    }
  },
}
