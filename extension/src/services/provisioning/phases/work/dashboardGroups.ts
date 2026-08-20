import type { TemplateAssetLoader } from '../../../TemplateAssetLoader'

const dashboardDirectory = 'Dashboard'
const dashboardFileName = 'Dashboard.json'
const queriesSegment = 'Queries'

/**
 * A dashboard/shared-queries "group": either the project's root/default team
 * (`teamName: null`) or one named team, each with its own optional
 * `Dashboard.json` and set of `Queries/*.json` assets.
 *
 * Every current template nests queries and dashboards exclusively under
 * `Dashboard/` - `Dashboard/Dashboard.json` + `Dashboard/Queries/*.json` for
 * the root team, `Dashboard/&lt;Team&gt;/Dashboard.json` +
 * `Dashboard/&lt;Team&gt;/Queries/*.json` per named team. There is no
 * top-level `Queries/` folder.
 */
export interface DashboardGroup {
  teamName: string | null
  dashboardAsset?: string
  queryAssets: string[]
}

/**
 * Classifies supported `Dashboard/**\/*.json` assets into their owning group.
 * Legacy templates can carry unrelated helper JSON (for example,
 * `Dashboard/WidgetQuery.json`), which is intentionally ignored.
 */
export function discoverDashboardGroups(loader: TemplateAssetLoader): DashboardGroup[] {
  const groups = new Map<string | null, DashboardGroup>()

  const getGroup = (teamName: string | null): DashboardGroup => {
    const existing = groups.get(teamName)
    if (existing) {
      return existing
    }
    const created: DashboardGroup = { teamName, queryAssets: [] }
    groups.set(teamName, created)
    return created
  }

  for (const file of loader.filesUnder(dashboardDirectory)) {
    const segments = file.split('/')

    if (segments.length === 2 && segments[1] === dashboardFileName) {
      getGroup(null).dashboardAsset = file
    } else if (segments.length === 3 && segments[1] === queriesSegment) {
      getGroup(null).queryAssets.push(file)
    } else if (segments.length === 3 && segments[2] === dashboardFileName) {
      getGroup(segments[1]).dashboardAsset = file
    } else if (segments.length === 4 && segments[2] === queriesSegment) {
      getGroup(segments[1]).queryAssets.push(file)
    }
  }

  return [...groups.values()]
}
