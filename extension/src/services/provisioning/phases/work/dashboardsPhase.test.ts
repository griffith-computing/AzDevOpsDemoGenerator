import { describe, expect, it, vi } from 'vitest'
import { dashboardsPhase } from './dashboardsPhase'
import { setSharedQueryIdMap } from './queryState'
import { createProvisioningState } from '../../types'
import type { ProvisioningContext } from '../../types'
import type { DashboardTemplate } from './dashboardModels'

interface MockFiles {
  [path: string]: DashboardTemplate
}

function mockLoader(files: MockFiles): ProvisioningContext['loader'] {
  return {
    filesUnder: (directory: string) =>
      Object.keys(files).filter((file) => file.startsWith(`${directory}/`)),
    json: async (path: string) => files[path],
  } as unknown as ProvisioningContext['loader']
}

function contextWith(
  loader: ProvisioningContext['loader'],
  client: ProvisioningContext['client'],
): ProvisioningContext {
  return {
    client,
    loader,
    template: {
      Key: 'template',
      Name: 'Template',
      TemplateFolder: 'Template',
      Description: 'Template',
    },
    state: createProvisioningState('project-id', 'Contoso PoC'),
    signal: new AbortController().signal,
  }
}

function dashboardsClient(onCreateReal: (body: Record<string, unknown>) => void) {
  return vi.fn(async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    if (method === 'GET' && path.includes('/_apis/dashboard/dashboards?')) {
      return { dashboardEntries: [{ id: 'default-id', name: 'Default' }] }
    }
    if (method === 'POST' && path.includes('/_apis/dashboard/dashboards?')) {
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      if (body.name === 'Working') {
        return { id: 'temp-id' }
      }
      onCreateReal(body)
      return { id: 'created-id' }
    }
    if (method === 'DELETE') {
      return undefined
    }
    if (method === 'GET' && path.includes('/teams/')) {
      return { id: 'team-id', name: 'Contoso PoC Team' }
    }
    throw new Error(`Unexpected request: ${method} ${path}`)
  }) as unknown as ProvisioningContext['client']['request']
}

describe('dashboardsPhase.isApplicable', () => {
  it('requires at least one dashboard group to have a Dashboard.json asset', () => {
    const withDashboard = contextWith(
      mockLoader({
        'Dashboard/Dashboard.json': {
          name: 'Overview',
          description: '',
          refreshInterval: 0,
          position: 0,
          widgets: [],
        },
      }),
      {} as ProvisioningContext['client'],
    )
    const withoutDashboard = contextWith(
      mockLoader({}),
      {} as ProvisioningContext['client'],
    )

    expect(dashboardsPhase.isApplicable(withDashboard)).toBe(true)
    expect(dashboardsPhase.isApplicable(withoutDashboard)).toBe(false)
  })
})

describe('dashboardsPhase.run', () => {
  it('resolves query-name aliases and team/date tokens, swapping the default dashboard', async () => {
    const loader = mockLoader({
      'Dashboard/Dashboard.json': {
        name: 'Overview',
        description: 'Team $DefaultTeamId$ from $startDate$ to $endDate$',
        refreshInterval: 60000,
        position: 0,
        widgets: [{ name: 'Bugs widget', settings: '{"queryId":"$ActiveBugs$"}' }],
      },
    })

    let createdBody: Record<string, unknown> | undefined
    const request = dashboardsClient((body) => {
      createdBody = body
    })
    const client = { request } as unknown as ProvisioningContext['client']
    const context = contextWith(loader, client)
    // Normally populated by sharedQueriesPhase (a declared dependency); the
    // real query name ("Critical Bugs") is what the ActiveBugs alias in
    // dashboardsPhase resolves against.
    setSharedQueryIdMap(context, null, new Map([['Critical Bugs', 'query-id-42']]))

    await dashboardsPhase.run(context)

    expect(request).toHaveBeenCalledTimes(6)
    expect(createdBody).toBeDefined()
    const widgets = createdBody!.widgets as Array<{ settings: string }>
    expect(JSON.parse(widgets[0].settings)).toEqual({ queryId: 'query-id-42' })
    expect(createdBody!.description).toMatch(
      /^Team team-id from \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}$/u,
    )
    expect(createdBody!.description).not.toContain('$')
  })

  it('throws when a dashboard token cannot be resolved, before creating the real dashboard', async () => {
    const loader = mockLoader({
      'Dashboard/Dashboard.json': {
        name: 'Overview',
        description: 'Uses $SomeUnknownToken$',
        refreshInterval: 60000,
        position: 0,
        widgets: [],
      },
    })

    let createdReal = false
    const request = dashboardsClient(() => {
      createdReal = true
    })
    const client = { request } as unknown as ProvisioningContext['client']
    const context = contextWith(loader, client)
    setSharedQueryIdMap(context, null, new Map())

    await expect(dashboardsPhase.run(context)).rejects.toThrow(
      /Dashboard "Overview" has unresolved template values: SomeUnknownToken\./u,
    )
    expect(createdReal).toBe(false)
  })
})
