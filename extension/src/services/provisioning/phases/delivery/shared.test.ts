import { describe, expect, it } from 'vitest'
import {
  assertNoUnresolvedPlaceholders,
  buildDefinitionIdTokens,
  findUnresolvedTokens,
  generateShortId,
  mergeIdentifierTokens,
  rememberBuildDefinitionId,
  substituteExtendedTokens,
  wholeValuePlaceholder,
} from './shared'
import { createProvisioningState } from '../../types'

describe('assertNoUnresolvedPlaceholders', () => {
  it('does not throw when every placeholder has been resolved', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders({ name: 'resolved', url: 'https://example.com' }, 'Widget'),
    ).not.toThrow()
  })

  it('calls out credential-shaped tokens distinctly from a generic message', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders(
        { username: '$username$', password: '$password$' },
        'Service endpoint "GitHub"',
      ),
    ).toThrowError(
      /Service endpoint "GitHub" requires credential\(s\) "username", "password" that this browser-based provisioning tool cannot supply safely/u,
    )
  })

  it('reports non-credential unresolved tokens as a generic unmet dependency', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders({ queueId: '$Azure Pipelines$' }, 'Build definition "CI"'),
    ).toThrowError(
      /Build definition "CI" left unresolved placeholder\(s\) "Azure Pipelines"\./u,
    )
  })

  it('reports both credential and generic tokens together when both are present', () => {
    let error: Error | undefined
    try {
      assertNoUnresolvedPlaceholders(
        { apiKey: '$Apikey$', queue: '$Hosted Ubuntu 1604$' },
        'Service endpoint "SonarQube"',
      )
    } catch (caught) {
      error = caught as Error
    }

    expect(error?.message).toContain('requires credential(s) "Apikey"')
    expect(error?.message).toContain('and left unresolved placeholder(s) "Hosted Ubuntu 1604"')
  })

  it('recognizes a bare PAT token as credential-shaped even without a credential keyword', () => {
    expect(() =>
      assertNoUnresolvedPlaceholders({ token: '$PAT$' }, 'Service endpoint "AzureRepos"'),
    ).toThrowError(/requires credential\(s\) "PAT"/u)
  })
})

describe('substituteExtendedTokens / findUnresolvedTokens', () => {
  it('replaces free-form tokens (spaces, hyphens) and leaves unresolvable ones untouched', () => {
    const resolve = (token: string): string | undefined =>
      token === 'App Development Team' ? 'team-id' : undefined

    const result = substituteExtendedTokens(
      {
        owner: '$App Development Team$',
        queue: '$Azure Pipelines$',
        nested: ['$App Development Team$'],
      },
      resolve,
    )

    expect(result).toEqual({
      owner: 'team-id',
      queue: '$Azure Pipelines$',
      nested: ['team-id'],
    })
    expect(findUnresolvedTokens(result)).toEqual(['Azure Pipelines'])
  })

  it('collects every distinct unresolved token exactly once', () => {
    const tokens = findUnresolvedTokens({
      a: '$Foo$',
      b: ['$Foo$', '$Bar$'],
      c: { d: '$Foo$' },
    })

    expect(tokens).toEqual(['Foo', 'Bar'])
  })
})

describe('wholeValuePlaceholder', () => {
  it('extracts the token name from a value that is entirely one placeholder', () => {
    expect(wholeValuePlaceholder('$Azure Pipelines$')).toBe('Azure Pipelines')
    expect(wholeValuePlaceholder('  $Azure Pipelines$  ')).toBe('Azure Pipelines')
  })

  it('returns undefined for a resolved value or a mixed string', () => {
    expect(wholeValuePlaceholder('already-resolved-id')).toBeUndefined()
    expect(wholeValuePlaceholder('prefix-$Token$-suffix')).toBeUndefined()
    expect(wholeValuePlaceholder(42)).toBeUndefined()
  })
})

describe('mergeIdentifierTokens', () => {
  it('stores both the exact-case and lower-cased identifier name', () => {
    const target = new Map<string, string>()
    mergeIdentifierTokens(target, new Map<string, string | number>([['MyShuttleDocker', 7]]))

    expect(target.get('MyShuttleDocker')).toBe('7')
    expect(target.get('myshuttledocker')).toBe('7')
  })
})

describe('buildDefinitionIdTokens / rememberBuildDefinitionId', () => {
  it('round-trips build definition ids under a namespaced -id key', () => {
    const state = createProvisioningState('project-id', 'Contoso')
    rememberBuildDefinitionId(state, 'SmartHotel-CouponManagement-CI', 'build-def-42')
    state.values.set('unrelated', 'value')

    const tokens = buildDefinitionIdTokens(state)

    expect(tokens.get('SmartHotel-CouponManagement-CI-id')).toBe('build-def-42')
    expect(tokens.has('unrelated')).toBe(false)
  })
})

describe('generateShortId', () => {
  it('generates an 8-character lower-case hex id with no dashes', () => {
    const id = generateShortId()
    expect(id).toMatch(/^[0-9a-f]{8}$/u)
  })
})
