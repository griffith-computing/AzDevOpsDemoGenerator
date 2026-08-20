import { describe, expect, it } from 'vitest'
import { validateProjectName } from './projectName'

describe('validateProjectName', () => {
  it('accepts a normal proof-of-concept project name', () => {
    expect(() => validateProjectName('Contoso PoC 2026')).not.toThrow()
  })

  it.each(['', ' project', 'project.', 'project/name', 'project#name'])(
    'rejects invalid project name %j',
    (name) => {
      expect(() => validateProjectName(name)).toThrow()
    },
  )
})
