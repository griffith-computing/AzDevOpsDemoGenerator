import type { JsonValue } from './jsonValue'

/**
 * A single dashboard widget as captured in a `Dashboard.json` template asset.
 * Exported captures carry many widget-type-specific and cosmetic properties
 * (`position`, `size`, `settingsVersion`, `lightboxOptions`, stray `url`/
 * `_links` left over from the export, ...); only `name` and `settings` (the
 * JSON-encoded string holding `$queryName$`/`$DefaultTeamId$`/etc.
 * placeholders) are read or written by `dashboardsPhase`, so every other
 * property is passed through untouched via the index signature.
 */
export interface DashboardWidgetTemplate {
  name: string
  settings: string | null
  [key: string]: JsonValue
}

/** The contents of a `Dashboard/[&lt;Team&gt;/]Dashboard.json` template asset. */
export interface DashboardTemplate {
  name: string
  description: string
  refreshInterval: number
  position: number
  widgets: DashboardWidgetTemplate[]
  dashboardScope?: string
}

/** One entry from the team dashboards list endpoint. */
export interface DashboardListEntry {
  id: string
  name: string
}

/** Response returned by the list-dashboards endpoint. */
export interface DashboardListResponse {
  count: number
  value: DashboardListEntry[]
}

/** Response returned by the create-dashboard endpoint. */
export interface DashboardCreateResponse {
  id: string
}

/** Body for the temporary placeholder dashboard used while swapping out the default dashboard. */
export interface TemporaryDashboardBody {
  name: string
  position: number
}

/** Response returned by the team-by-name lookup endpoint. */
export interface TeamResponse {
  id: string
  name: string
}
