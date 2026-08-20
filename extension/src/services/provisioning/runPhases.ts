import type { ProvisioningEvent } from '../../types'
import type { ProvisioningContext, ProvisioningPhase } from './types'

export async function runPhases(
  phases: ProvisioningPhase[],
  context: ProvisioningContext,
  emit: (event: ProvisioningEvent) => void,
): Promise<void> {
  const completed = new Set<string>()

  for (const phase of phases) {
    try {
      if (!(phase.dependsOn ?? []).every((dependency) => completed.has(dependency))) {
        throw new Error(
          `${phase.label} cannot run because a required provisioning phase did not complete.`,
        )
      }

      if (!phase.isApplicable(context)) {
        emit({
          stepId: phase.id,
          label: phase.label,
          status: 'skipped',
          message: 'The selected template does not use this capability.',
        })
        completed.add(phase.id)
        continue
      }

      emit({ stepId: phase.id, label: phase.label, status: 'running' })
      await phase.run(context)
      completed.add(phase.id)
      emit({ stepId: phase.id, label: phase.label, status: 'succeeded' })
    } catch (error) {
      emit({
        stepId: phase.id,
        label: phase.label,
        status: 'failed',
        message: error instanceof Error ? error.message : 'Provisioning failed.',
      })
      throw error
    }
  }
}
