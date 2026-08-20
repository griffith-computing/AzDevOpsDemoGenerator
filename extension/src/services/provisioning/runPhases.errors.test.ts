import { describe, expect, it, vi } from 'vitest'
import { runPhases } from './runPhases'
import { createProvisioningState } from './types'
import type { ProvisioningContext, ProvisioningPhase } from './types'

function context(signal: AbortSignal = new AbortController().signal): ProvisioningContext {
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
    signal,
  }
}

describe('runPhases dependency failures', () => {
  it('throws before running a phase whose dependency never completed', async () => {
    const run = vi.fn()
    const phases: ProvisioningPhase[] = [
      {
        id: 'second',
        label: 'Second',
        dependsOn: ['first'],
        isApplicable: () => true,
        run,
      },
    ]

    await expect(runPhases(phases, context(), vi.fn())).rejects.toThrow(
      'Second cannot run because a required provisioning phase did not complete.',
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('treats a skipped (inapplicable) dependency as satisfied', async () => {
    const calls: string[] = []
    const phases: ProvisioningPhase[] = [
      {
        id: 'optional',
        label: 'Optional',
        isApplicable: () => false,
        run: async () => {
          calls.push('optional')
        },
      },
      {
        id: 'dependent',
        label: 'Dependent',
        dependsOn: ['optional'],
        isApplicable: () => true,
        run: async () => {
          calls.push('dependent')
        },
      },
    ]

    await runPhases(phases, context(), vi.fn())

    expect(calls).toEqual(['dependent'])
  })
})

describe('runPhases error propagation', () => {
  it('emits failed with the thrown message and rethrows, without running later phases', async () => {
    const laterRun = vi.fn()
    const emit = vi.fn()
    const phases: ProvisioningPhase[] = [
      {
        id: 'boom',
        label: 'Boom phase',
        isApplicable: () => true,
        run: async () => {
          throw new Error('Azure DevOps rejected the request.')
        },
      },
      {
        id: 'later',
        label: 'Later phase',
        isApplicable: () => true,
        run: laterRun,
      },
    ]

    await expect(runPhases(phases, context(), emit)).rejects.toThrow(
      'Azure DevOps rejected the request.',
    )

    expect(laterRun).not.toHaveBeenCalled()
    expect(emit).toHaveBeenNthCalledWith(1, {
      stepId: 'boom',
      label: 'Boom phase',
      status: 'running',
    })
    expect(emit).toHaveBeenNthCalledWith(2, {
      stepId: 'boom',
      label: 'Boom phase',
      status: 'failed',
      message: 'Azure DevOps rejected the request.',
    })
  })

  it('falls back to a generic failure message for a non-Error throw', async () => {
    const emit = vi.fn()
    const phases: ProvisioningPhase[] = [
      {
        id: 'weird',
        label: 'Weird phase',
        isApplicable: () => true,
        run: async () => {
          // eslint-disable-next-line @typescript-eslint/no-throw-literal
          throw 'not an Error instance'
        },
      },
    ]

    await expect(runPhases(phases, context(), emit)).rejects.toBe('not an Error instance')

    expect(emit).toHaveBeenNthCalledWith(2, {
      stepId: 'weird',
      label: 'Weird phase',
      status: 'failed',
      message: 'Provisioning failed.',
    })
  })
})

describe('runPhases cancellation', () => {
  it('propagates an already-aborted signal as a failure and stops the run', async () => {
    const controller = new AbortController()
    controller.abort(new DOMException('The operation was aborted.', 'AbortError'))
    const emit = vi.fn()
    const laterRun = vi.fn()

    const phases: ProvisioningPhase[] = [
      {
        id: 'network-call',
        label: 'Network call',
        isApplicable: () => true,
        run: async (ctx) => {
          ctx.signal.throwIfAborted()
        },
      },
      {
        id: 'later',
        label: 'Later phase',
        isApplicable: () => true,
        run: laterRun,
      },
    ]

    await expect(runPhases(phases, context(controller.signal), emit)).rejects.toMatchObject({
      name: 'AbortError',
    })

    expect(laterRun).not.toHaveBeenCalled()
    expect(emit).toHaveBeenNthCalledWith(2, {
      stepId: 'network-call',
      label: 'Network call',
      status: 'failed',
      message: 'The operation was aborted.',
    })
  })

  it('propagates cancellation raised mid-phase via the shared AbortSignal', async () => {
    const controller = new AbortController()
    const emit = vi.fn()

    const phases: ProvisioningPhase[] = [
      {
        id: 'long-running',
        label: 'Long running phase',
        isApplicable: () => true,
        run: async (ctx) => {
          controller.abort(new DOMException('Cancelled by caller.', 'AbortError'))
          ctx.signal.throwIfAborted()
        },
      },
    ]

    await expect(
      runPhases(phases, context(controller.signal), emit),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(emit).toHaveBeenNthCalledWith(2, {
      stepId: 'long-running',
      label: 'Long running phase',
      status: 'failed',
      message: 'Cancelled by caller.',
    })
  })
})
