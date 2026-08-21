import { describe, expect, it, vi } from 'vitest'
import { runPhases } from './runPhases'
import { createProvisioningState } from './types'
import type { ProvisioningContext, ProvisioningPhase } from './types'

function context(): ProvisioningContext {
  return {
    client: {} as ProvisioningContext['client'],
    loader: {} as ProvisioningContext['loader'],
    template: {
      Key: 'template',
      Name: 'Template',
      TemplateFolder: 'Template',
      Description: 'Template',
    },
    state: createProvisioningState('project-id', 'Project'),
    signal: new AbortController().signal,
  }
}

describe('runPhases', () => {
  it('runs phases in order and emits lifecycle events', async () => {
    const calls: string[] = []
    const phases: ProvisioningPhase[] = [
      {
        id: 'first',
        label: 'First',
        isApplicable: () => true,
        run: async () => {
          calls.push('first')
        },
      },
      {
        id: 'second',
        label: 'Second',
        dependsOn: ['first'],
        isApplicable: () => true,
        run: async () => {
          calls.push('second')
        },
      },
    ]
    const emit = vi.fn()

    await runPhases(phases, context(), emit)

    expect(calls).toEqual(['first', 'second'])
    expect(emit).toHaveBeenCalledTimes(5)
    expect(emit).toHaveBeenLastCalledWith({
      stepId: 'complete',
      label: 'Template Project Creation Complete',
      status: 'succeeded',
    })
  })

  it('completes when an inapplicable phase is skipped', async () => {
    const run = vi.fn()
    const emit = vi.fn()
    await runPhases(
      [
        {
          id: 'optional',
          label: 'Optional',
          isApplicable: () => false,
          run,
        },
      ],
      context(),
      emit,
    )

    expect(run).not.toHaveBeenCalled()
    expect(emit).toHaveBeenLastCalledWith({
      stepId: 'complete',
      label: 'Template Project Creation Complete',
      status: 'succeeded',
    })
  })
})
