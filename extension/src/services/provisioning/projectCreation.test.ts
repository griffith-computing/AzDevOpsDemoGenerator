import { describe, expect, it } from 'vitest'
import {
  type ProjectCreationClient,
  waitForProjectCreation,
} from './projectCreation'

class StubClient implements ProjectCreationClient {
  readonly paths: string[] = []
  private readonly responses: unknown[]

  constructor(responses: unknown[]) {
    this.responses = responses
  }

  async request<T>(path: string): Promise<T> {
    this.paths.push(path)
    if (this.responses.length === 0) {
      throw new Error(`No stub response remains for ${path}.`)
    }
    return this.responses.shift() as T
  }
}

const noDelay = async () => undefined

describe('waitForProjectCreation', () => {
  it('waits through operation progress and the documented new project state', async () => {
    const client = new StubClient([
      { id: 'operation-id', status: 'inProgress' },
      { id: 'operation-id', status: 'succeeded' },
      { id: 'project-id', name: 'Demo project', state: 'new' },
      { id: 'project-id', name: 'Demo project', state: 'wellFormed' },
    ])

    const project = await waitForProjectCreation(
      client,
      {
        id: 'operation-id',
        pluginId: 'plugin-id',
        status: 'queued',
      },
      'Demo project',
      new AbortController().signal,
      { delay: noDelay },
    )

    expect(project.state).toBe('wellFormed')
    expect(client.paths).toEqual([
      '/_apis/operations/operation-id?api-version=7.1&pluginId=plugin-id',
      '/_apis/operations/operation-id?api-version=7.1&pluginId=plugin-id',
      '/_apis/projects/Demo%20project?includeCapabilities=false&api-version=7.1',
      '/_apis/projects/Demo%20project?includeCapabilities=false&api-version=7.1',
    ])
  })

  it('surfaces the operation failure message', async () => {
    const client = new StubClient([
      {
        id: 'operation-id',
        status: 'failed',
        resultMessage: 'The process template is unavailable.',
      },
    ])

    await expect(
      waitForProjectCreation(
        client,
        { id: 'operation-id', status: 'queued' },
        'Demo project',
        new AbortController().signal,
        { delay: noDelay },
      ),
    ).rejects.toThrow(
      'Project creation failed: The process template is unavailable.',
    )
  })
})
