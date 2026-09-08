import { describe, expect, it } from 'vitest'
import { SIGN_IN_PROVIDERS, safeReturnTo, signInUrl } from './provider-url'

describe('signInUrl (AUTH-1)', () => {
  it('offers exactly the two ways in, and no third', () => {
    expect(SIGN_IN_PROVIDERS.map((provider) => provider.id)).toEqual(['github', 'google'])
  })

  it.each(SIGN_IN_PROVIDERS)('points $id at its own start route', (provider) => {
    expect(signInUrl(provider.id, '/')).toBe(`/api/v1/auth/${provider.id}?returnTo=%2F`)
  })

  it('encodes the path to come back to, exactly once', () => {
    expect(signInUrl('github', '/projects/abc?tab=feedback')).toBe(
      '/api/v1/auth/github?returnTo=%2Fprojects%2Fabc%3Ftab%3Dfeedback',
    )
  })

  it('encodes a path that already contains an escape, without doubling it', () => {
    expect(signInUrl('google', '/users/a%20b')).toBe(
      '/api/v1/auth/google?returnTo=%2Fusers%2Fa%2520b',
    )
  })
})

describe('safeReturnTo', () => {
  it('keeps a path on this site', () => {
    expect(safeReturnTo('/settings')).toBe('/settings')
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['an absolute url', 'https://evil.test/steal'],
    ['a protocol-relative url', '//evil.test'],
    ['something that is not a path', 'settings'],
  ])('falls back to the root for %s', (_name, value) => {
    expect(safeReturnTo(value)).toBe('/')
  })

  /** The api validates this again; sending nonsense is simply not this side's job. */
  it('sends the root rather than an off-site url', () => {
    expect(signInUrl('github', 'https://evil.test')).toBe('/api/v1/auth/github?returnTo=%2F')
  })
})
