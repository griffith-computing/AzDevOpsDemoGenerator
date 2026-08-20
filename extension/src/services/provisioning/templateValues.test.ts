import { describe, expect, it } from 'vitest'
import { applyTemplateValues } from './templateValues'
import { createProvisioningState } from './types'

describe('applyTemplateValues', () => {
  it('replaces known tokens recursively without changing unknown tokens', () => {
    const state = createProvisioningState('project-id', 'Contoso PoC')
    state.values.set('repositoryId', 'repo-id')

    const result = applyTemplateValues(
      {
        name: '$projectName$',
        nested: ['$projectId$', '$repositoryId$', '$unknown$'],
      },
      state,
    )

    expect(result).toEqual({
      name: 'Contoso PoC',
      nested: ['project-id', 'repo-id', '$unknown$'],
    })
  })
})
