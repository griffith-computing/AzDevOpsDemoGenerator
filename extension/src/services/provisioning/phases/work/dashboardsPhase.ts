import type { ProvisioningContext, ProvisioningPhase } from '../../types'
import { applyTemplateValues } from '../../templateValues'
import { discoverDashboardGroups, type DashboardGroup } from './dashboardGroups'
import type {
  DashboardCreateResponse,
  DashboardListResponse,
  DashboardTemplate,
  TeamResponse,
  TemporaryDashboardBody,
} from './dashboardModels'
import { getSharedQueryIdMap } from './queryState'
import { substituteTokens } from './tokens'

const temporaryDashboardName = 'Working'
const temporaryDashboardPosition = 4
const unresolvedTokenPattern = /\$([^$]+)\$/gu

const queryAliases: Record<string, string[]> = {
  ActiveBugs: ['Critical Bugs', 'Active Bugs_WI'],
  AllItems: ['All Items_WI'],
  AllWorkItems: ['All Work Items'],
  Bugs: ['Bugs'],
  Epic: ['Epics'],
  Feature: ['Feature'],
  Features: ['Feature'],
  Feedback: ['Feedback_WI'],
  PBI: ['Product Backlog Items'],
  Task: ['Tasks'],
  Tasks: ['Tasks'],
  TestCase: ['Test Case-Readiness', 'Test Cases'],
  TestPlan: ['Test Plans'],
  TestSuite: ['Test Suites'],
  UnfinishedWork: ['Unfinished Work_WI'],
  'Unfinished Work': ['Unfinished Work_WI'],
  UserStories: ['User Stories'],
  WorkinProgress: ['Work in Progress', 'Work in Progress_WI'],
}

function dashboardsBasePath(projectId: string, teamName: string): string {
  return `/${encodeURIComponent(projectId)}/${encodeURIComponent(
    teamName,
  )}/_apis/dashboard/dashboards`
}

async function getDefaultDashboardId(
  context: ProvisioningContext,
  teamName: string,
): Promise<string> {
  const { client, state, signal } = context
  const response = await client.request<DashboardListResponse>(
    `${dashboardsBasePath(state.projectId, teamName)}?api-version=7.1`,
    {},
    signal,
  )
  const entry = response.dashboardEntries[0]
  if (!entry) {
    throw new Error(`Team "${teamName}" has no default dashboard to replace.`)
  }
  return entry.id
}

async function getTeamByName(
  context: ProvisioningContext,
  teamName: string,
): Promise<TeamResponse> {
  const { client, state, signal } = context
  return client.request<TeamResponse>(
    `/_apis/projects/${encodeURIComponent(state.projectName)}/teams/${encodeURIComponent(
      teamName,
    )}?api-version=7.1`,
    {},
    signal,
  )
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number): Date {
  const shifted = new Date(date.getTime())
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

function firstValue(
  values: ReadonlyMap<string, string>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = values.get(key)
    if (value) return value
  }
  return undefined
}

function addDashboardTokens(
  context: ProvisioningContext,
  dashboard: DashboardTemplate,
  queryIds: ReadonlyMap<string, string>,
  tokenValues: Map<string, string>,
): void {
  for (const [token, names] of Object.entries(queryAliases)) {
    const queryId = firstValue(queryIds, names)
    if (queryId) tokenValues.set(token, queryId)
  }

  for (const widget of dashboard.widgets) {
    if (!widget.settings) continue
    const queryToken = /"queryId"\s*:\s*"?\$([^$]+)\$"?/u.exec(widget.settings)?.[1]
    const queryName = /"queryName"\s*:\s*"([^"]+)"/u.exec(widget.settings)?.[1]
    if (queryToken && queryName) {
      const queryId = queryIds.get(queryName)
      if (queryId) tokenValues.set(queryToken, queryId)
    }
  }

  for (const [key, value] of context.state.values) {
    if (typeof value === 'string') tokenValues.set(key, value)
    if (typeof value === 'number') tokenValues.set(key, String(value))
  }
  for (const [name, id] of context.state.repositoryIds) {
    tokenValues.set(name, id)
  }

  const resourceAliases: Record<string, string | undefined> = {
    BuildDefId: stringStateValue(context, 'FirstBuildDefinitionId'),
    BuildDocker: stringStateValue(context, 'MHCDocker.build-id'),
    BuildSonarQube: stringStateValue(context, 'SonarQube-id'),
    buildGitHub: stringStateValue(context, 'GitHub-id'),
    buildPHP: stringStateValue(context, 'PHP-id'),
    buildWhiteSource: stringStateValue(context, 'WhiteSourceBolt-id'),
    ReleaseDocker: stringStateValue(context, 'release:MHCDocker.release'),
    releaseGitHub: stringStateValue(context, 'release:GitHub'),
    releasePHP: stringStateValue(context, 'release:PHP'),
    RepoMyShuttleDocker: context.state.repositoryIds.get('MyShuttleDocker'),
  }
  for (const [token, id] of Object.entries(resourceAliases)) {
    if (id) tokenValues.set(token, id)
  }
}

function stringStateValue(
  context: ProvisioningContext,
  key: string,
): string | undefined {
  const value = context.state.values.get(key)
  return typeof value === 'string' ? value : undefined
}

function assertNoDashboardTokens(dashboard: DashboardTemplate): void {
  const tokens = new Set<string>()
  for (const match of JSON.stringify(dashboard).matchAll(unresolvedTokenPattern)) {
    tokens.add(match[1])
  }
  if (tokens.size > 0) {
    throw new Error(
      `Dashboard "${dashboard.name}" has unresolved template values: ${[...tokens].join(', ')}.`,
    )
  }
}

/**
 * Replaces one dashboard group's default dashboard with the template's
 * `Dashboard.json`, following the swap workaround in `CreateNewDashBoard`/
 * `DeleteDefaultDashboard` (`src/API/QueriesAndWidgets/Queries.cs`) and the
 * "gen-eshoponweb" generic branch of `CreateQueryAndWidgets`
 * (`src/ADOGenerator/Services/ProjectService.cs`): a project's default
 * dashboard cannot be deleted directly while it is the only dashboard, so a
 * temporary dashboard is created first to take its place, the original is
 * then deleted, the real dashboard is created, and finally the temporary one
 * is removed.
 */
async function provisionDashboard(
  context: ProvisioningContext,
  group: DashboardGroup,
): Promise<void> {
  const { client, loader, state, signal } = context
  const dashboardAsset = group.dashboardAsset
  if (!dashboardAsset) {
    return
  }

  const teamName = group.teamName ?? state.defaultTeamName

  const defaultDashboardId = await getDefaultDashboardId(context, teamName)

  const temporaryBody: TemporaryDashboardBody = {
    name: temporaryDashboardName,
    position: temporaryDashboardPosition,
  }
  const temporaryDashboard = await client.request<DashboardCreateResponse>(
    `${dashboardsBasePath(state.projectId, teamName)}?api-version=7.1`,
    { method: 'POST', body: JSON.stringify(temporaryBody) },
    signal,
  )

  await client.request<void>(
    `${dashboardsBasePath(state.projectId, teamName)}/${encodeURIComponent(
      defaultDashboardId,
    )}?api-version=7.1`,
    { method: 'DELETE' },
    signal,
  )

  const rawDashboard = await loader.json<DashboardTemplate>(dashboardAsset)
  // `$projectId$`/`$ProjectId$` etc. mean the real project GUID here (unlike
  // the query-specific `$projectId$`-means-name override in
  // `sharedQueriesPhase`), so applying the shared default token map is safe.
  const dashboardAfterDefaults = applyTemplateValues(rawDashboard, state)

  const teamDetails = await getTeamByName(context, teamName)
  const now = new Date()
  const startDate = formatDate(addDays(now, -3))
  const endDate = formatDate(addDays(now, 3))
  const queryIdMap = getSharedQueryIdMap(context, group.teamName)

  const tokenValues = new Map<string, string>([
    ['DefaultTeamId', teamDetails.id],
    ['startDate', startDate],
    ['endDate', endDate],
  ])
  for (const [queryName, queryId] of queryIdMap) {
    tokenValues.set(queryName, queryId)
  }
  addDashboardTokens(context, dashboardAfterDefaults, queryIdMap, tokenValues)

  const dashboard = substituteTokens(dashboardAfterDefaults, tokenValues)
  assertNoDashboardTokens(dashboard)

  const created = await client.request<DashboardCreateResponse>(
    `${dashboardsBasePath(state.projectId, teamName)}?api-version=7.1`,
    { method: 'POST', body: JSON.stringify(dashboard) },
    signal,
  )
  if (!created.id) {
    throw new Error(`Dashboard "${dashboard.name}" creation did not return a dashboard id.`)
  }

  await client.request<void>(
    `${dashboardsBasePath(state.projectId, teamName)}/${encodeURIComponent(
      temporaryDashboard.id,
    )}?api-version=7.1`,
    { method: 'DELETE' },
    signal,
  )
}

/**
 * Creates the dashboards declared under `Dashboard/[&lt;Team&gt;/]Dashboard.json`,
 * one per dashboard group (the root/default team, plus one per named team),
 * ported from the "gen-eshoponweb" generic branch of `CreateQueryAndWidgets`
 * in `src/ADOGenerator/Services/ProjectService.cs`.
 *
 * Depends on `work-shared-queries` because widget `settings` placeholders
 * (e.g. `$Active Bugs$`, matching a query's own name) are resolved against
 * the per-group `queryName -&gt; id` map `sharedQueriesPhase` stores via
 * `setSharedQueryIdMap`. `$DefaultTeamId$`/`$startDate$`/`$endDate$` are
 * resolved locally by this phase (team-by-name lookup and a +/-3 day window
 * around "now", matching the legacy branch).
 */
export const dashboardsPhase: ProvisioningPhase = {
  id: 'work-dashboards',
  label: 'Create dashboards',
  dependsOn: ['work-shared-queries', 'release-definitions'],
  isApplicable: (context) =>
    discoverDashboardGroups(context.loader).some((group) => group.dashboardAsset !== undefined),
  async run(context) {
    const groups = discoverDashboardGroups(context.loader).filter(
      (group) => group.dashboardAsset !== undefined,
    )
    for (const group of groups) {
      await provisionDashboard(context, group)
    }
  },
}
