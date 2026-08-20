import { describe, expect, it } from 'vitest'
import { provisioningPhases } from '.'

describe('provisioning phase registry', () => {
  it('contains unique phase ids with dependencies ordered first', () => {
    const completed = new Set<string>()

    for (const phase of provisioningPhases) {
      expect(completed.has(phase.id), `duplicate phase id ${phase.id}`).toBe(false)
      for (const dependency of phase.dependsOn ?? []) {
        expect(
          completed.has(dependency),
          `${phase.id} must run after ${dependency}`,
        ).toBe(true)
      }
      completed.add(phase.id)
    }
  })
})
