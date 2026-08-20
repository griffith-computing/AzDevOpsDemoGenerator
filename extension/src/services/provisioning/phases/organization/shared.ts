import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'

/** Relative path (from a template folder root) to the team roster manifest. */
export const teamsManifestPath = 'Teams/Teams.json'

/** Relative path (from a template folder root) to the reusable team-area template. */
export const teamAreaManifestPath = 'TeamArea.json'

/** Relative path (from a template folder root) to the project iteration tree. */
export const iterationsManifestPath = 'Iterations.json'

export interface TeamDefinition {
  id?: string
  name: string
  description?: string
  isDefault?: string | boolean
}

/** A classification node (area or iteration) as returned by the WIT classification nodes API. */
export interface ClassificationNode {
  id: number
  identifier: string
  name: string
  structureType: string
  hasChildren: boolean
  children?: ClassificationNode[]
}

export function isDefaultTeam(team: TeamDefinition): boolean {
  return String(team.isDefault ?? '').toLowerCase() === 'true'
}

export async function loadTeamDefinitions(loader: TemplateAssetLoader): Promise<TeamDefinition[]> {
  return loader.json<TeamDefinition[]>(teamsManifestPath)
}

/**
 * Returns true when at least one team asset folder contains a file whose name
 * (case-insensitively) matches `fileName`, e.g. `hasAnyTeamFile(loader, 'BoardColumns.json')`.
 */
export function hasAnyTeamFile(loader: TemplateAssetLoader, fileName: string): boolean {
  const suffix = `/${fileName}`.toLowerCase()
  return loader.entry.files.some(
    (file) => file.toLowerCase().startsWith('teams/') && file.toLowerCase().endsWith(suffix),
  )
}

/**
 * Team asset folders on disk may differ in letter-case from the `name` recorded in
 * Teams.json (Windows file systems are case-insensitive, so authors never noticed the
 * mismatch). Resolve the manifest folder segment for a team by comparing case-insensitively
 * and returning the path exactly as it is cased in the manifest.
 */
export function resolveTeamFolder(loader: TemplateAssetLoader, teamName: string): string | undefined {
  const needle = `teams/${teamName.toLowerCase()}/`
  const match = loader.entry.files.find((file) => file.toLowerCase().startsWith(needle))
  return match ? match.slice(0, needle.length - 1) : undefined
}

export function encodePathSegments(segments: string[]): string {
  return segments.map((segment) => encodeURIComponent(segment)).join('/')
}

export function projectPath(projectId: string, suffix: string): string {
  return `/${encodeURIComponent(projectId)}${suffix}`
}

export function teamPath(projectId: string, teamName: string, suffix: string): string {
  return `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamName)}${suffix}`
}

export function teamBoardPath(
  projectId: string,
  teamName: string,
  boardName: string,
  suffix: string,
): string {
  return `/${encodeURIComponent(projectId)}/${encodeURIComponent(teamName)}/_apis/work/boards/${encodeURIComponent(
    boardName,
  )}${suffix}`
}
