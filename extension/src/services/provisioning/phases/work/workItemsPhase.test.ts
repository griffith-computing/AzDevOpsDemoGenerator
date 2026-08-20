import { describe, expect, it, vi } from 'vitest'
import { workItemsPhase } from './workItemsPhase'
import { getWorkItemIdMap } from './workItemState'
import { createProvisioningState } from '../../types'
import type { ProvisioningContext } from '../../types'
import type { WorkItemImportFields, WorkItemImportFile } from './workItemModels'

function fields(overrides: Partial<WorkItemImportFields> = {}): WorkItemImportFields {
  return {
    'System.State': 'New',
    'System.Reason': 'New',
    'System.Title': 'Untitled',
    ...overrides,
  }
}

interface MockLoaderFiles {
  [path: string]: WorkItemImportFile
}

function mockLoader(files: MockLoaderFiles): ProvisioningContext['loader'] {
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

describe('workItemsPhase.isApplicable', () => {
  it('is only applicable when WorkItems template assets exist', () => {
    const withItems = contextWith(
      mockLoader({ 'WorkItems/Bug.json': { count: 0, value: [] } }),
      {} as ProvisioningContext['client'],
    )
    const withoutItems = contextWith(mockLoader({}), {} as ProvisioningContext['client'])

    expect(workItemsPhase.isApplicable(withItems)).toBe(true)
    expect(workItemsPhase.isApplicable(withoutItems)).toBe(false)
  })
})

describe('workItemsPhase.run', () => {
  it('creates work items file-by-file in sorted order, then wires relations in a second pass', async () => {
    const loader = mockLoader({
      'WorkItems/Bug.json': {
        count: 1,
        value: [
          {
            id: 100,
            rev: 1,
            fields: fields({ 'System.Title': 'Bug title' }),
            relations: [
              { rel: 'System.LinkTypes.Related', url: 'https://old.example.com/_apis/wit/workItems/200' },
              { rel: 'Hyperlink', url: 'https://external.example.com/spec' },
            ],
            url: 'https://old.example.com/_apis/wit/workItems/100',
          },
        ],
      },
      'WorkItems/Task.json': {
        count: 1,
        value: [
          {
            id: 200,
            rev: 1,
            fields: fields({ 'System.Title': 'Task title' }),
            relations: null,
            url: 'https://old.example.com/_apis/wit/workItems/200',
          },
        ],
      },
    })

    const calls: string[] = []
    let created = 0
    const request = vi.fn(async (path: string, init: RequestInit = {}) => {
      if (path.includes('/wit/workitems/$')) {
        created += 1
        const newId = 1000 + created
        calls.push(`create:${path}`)
        return { id: newId, rev: 1, url: `https://dev.azure.com/org/_apis/wit/workitems/${newId}` }
      }
      calls.push(`relation:${path}:${init.body}`)
      return { id: 0, rev: 2, url: '' }
    })
    const client = { request } as unknown as ProvisioningContext['client']
    const context = contextWith(loader, client)

    await workItemsPhase.run(context)

    // First pass creates every work item (Bug.json before Task.json, matching
    // sorted file order), before any relation is attempted.
    expect(calls[0]).toMatch(/^create:.*\$Bug/u)
    expect(calls[1]).toMatch(/^create:.*\$Task/u)
    expect(calls).toHaveLength(4)

    const relationCalls = calls.filter((call) => call.startsWith('relation:'))
    expect(relationCalls).toHaveLength(2)
    expect(relationCalls[0]).toContain('/wit/workitems/1001?')
    expect(relationCalls[0]).toContain('System.LinkTypes.Related')
    expect(relationCalls[0]).toContain('dev.azure.com/org/_apis/wit/workitems/1002')
    expect(relationCalls[1]).toContain('/wit/workitems/1001?')
    expect(relationCalls[1]).toContain('Hyperlink')
    expect(relationCalls[1]).toContain('https://external.example.com/spec')

    const idMap = getWorkItemIdMap(context)
    expect(idMap.get('100')).toMatchObject({ newId: '1001', type: 'Bug' })
    expect(idMap.get('200')).toMatchObject({ newId: '1002', type: 'Task' })
  })

  it('throws an actionable error when a relation target was never created', async () => {
    const loader = mockLoader({
      'WorkItems/Bug.json': {
        count: 1,
        value: [
          {
            id: 100,
            rev: 1,
            fields: fields(),
            relations: [
              { rel: 'System.LinkTypes.Related', url: 'https://old.example.com/_apis/wit/workItems/999' },
            ],
            url: 'https://old.example.com/_apis/wit/workItems/100',
          },
        ],
      },
    })

    const request = vi.fn(async () => ({
      id: 1001,
      rev: 1,
      url: 'https://dev.azure.com/org/_apis/wit/workitems/1001',
    }))
    const client = { request } as unknown as ProvisioningContext['client']
    const context = contextWith(loader, client)

    await expect(workItemsPhase.run(context)).rejects.toThrow(
      'Relation target work item 999 referenced by work item 100 was not created.',
    )
  })
})
