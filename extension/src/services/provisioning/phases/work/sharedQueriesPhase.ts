import type { ProvisioningPhase } from '../../types'
import { discoverDashboardGroups } from './dashboardGroups'
import type { QueryCreateResponse, QueryTemplate } from './queryModels'
import { setSharedQueryIdMap } from './queryState'
import { encodePathSegments, substituteTokens } from './tokens'

const sharedQueriesFolder = 'Shared%20Queries'

/**
 * Creates the shared queries declared under `Dashboard/[&lt;Team&gt;/]Queries/*.json`,
 * one per dashboard group (the root/default team, plus one per named team),
 * ported from the query-creation portion of `CreateQueryAndWidgets` in
 * `src/ADOGenerator/Services/ProjectService.cs` and `Queries.CreateQuery` in
 * `src/API/QueriesAndWidgets/Queries.cs`.
 *
 * Query `wiql` templates use the literal token `$projectId$` to mean the
 * project *name* (e.g. embedded in an `[System.AreaPath] = '$projectId$\Team'`
 * literal) - a different meaning than the same token text elsewhere (the
 * dashboard-widget and work-item templates use `$projectId$`/`$ProjectId$`
 * for the real project GUID, matching `applyTemplateValues`'s built-in
 * substitution). Because of that collision this phase deliberately does not
 * call the shared `applyTemplateValues` helper - doing so would resolve
 * `$projectId$` to the GUID before this phase's own, scoped-local override
 * could apply - and instead builds its own token map with `substituteTokens`.
 *
 * Resulting per-group `queryName -&gt; id` maps are stored via
 * `setSharedQueryIdMap` for `dashboardsPhase` to resolve dashboard widget
 * `queryId` placeholders.
 */
export const sharedQueriesPhase: ProvisioningPhase = {
  id: 'work-shared-queries',
  label: 'Create shared queries',
  isApplicable: (context) =>
    discoverDashboardGroups(context.loader).some((group) => group.queryAssets.length > 0),
  async run(context) {
    const { client, loader, state, signal } = context
    const groups = discoverDashboardGroups(loader).filter(
      (group) => group.queryAssets.length > 0,
    )

    // A newly created project's "Shared Queries" folder can reject the very
    // first create call until it has been read at least once; a single
    // warm-up GET (not repeated per group/query) materializes it, per the
    // workaround documented in `Queries.CreateQuery`. The original's
    // per-call `Thread.Sleep(2000)` is not replicated: it was a fixed guess
    // at eventual consistency rather than something this phase can wait on
    // deterministically.
    await client.request<unknown>(
      `/${encodeURIComponent(state.projectId)}/_apis/wit/queries?api-version=7.1`,
      {},
      signal,
    )

    const tokenValues = new Map<string, string>([
      ['projectId', state.projectName],
      ['projectName', state.projectName],
      ['ProjectName', state.projectName],
      ['ProjectId', state.projectId],
    ])

    for (const group of groups) {
      if (group.teamName) {
        await client.request<QueryCreateResponse>(
          `/${encodeURIComponent(state.projectId)}/_apis/wit/queries/${sharedQueriesFolder}?api-version=7.1`,
          {
            method: 'POST',
            body: JSON.stringify({ name: group.teamName, isFolder: true }),
          },
          signal,
        )
      }

      const idMap = new Map<string, string>()
      const sortedAssets = [...group.queryAssets].sort((a, b) => a.localeCompare(b))
      for (const asset of sortedAssets) {
        const raw = await loader.json<QueryTemplate>(asset)
        const query = substituteTokens(raw, tokenValues)
        const path = group.teamName
          ? `/${encodeURIComponent(state.projectId)}/_apis/wit/queries/${encodePathSegments(
              'Shared Queries',
              group.teamName,
            )}?api-version=7.1`
          : `/${encodeURIComponent(state.projectId)}/_apis/wit/queries/${sharedQueriesFolder}?api-version=7.1`

        const response = await client.request<QueryCreateResponse>(
          path,
          { method: 'POST', body: JSON.stringify(query) },
          signal,
        )
        idMap.set(response.name, response.id)
      }

      setSharedQueryIdMap(context, group.teamName, idMap)
    }
  },
}
