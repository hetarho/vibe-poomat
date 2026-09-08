import { describe, expect, it } from 'vitest'
import { loadArctic } from './arctic-module'

/**
 * The shape in arctic-module.ts is hand-written, because a type import from an
 * ES module into this CommonJS app needs an attribute Biome cannot parse. That
 * makes this test the thing standing between us and silent drift: if arctic
 * renames or reshapes any of it, the clients break here rather than at a
 * callback nobody can retry.
 */
describe('the arctic surface this app depends on', () => {
  it('loads from a CommonJS module at all, which a static import could not', async () => {
    await expect(loadArctic()).resolves.toBeDefined()
  })

  it('still exports the helpers', async () => {
    const arctic = await loadArctic()

    expect(arctic.generateState()).toEqual(expect.any(String))
    expect(arctic.generateCodeVerifier()).toEqual(expect.any(String))
    expect(typeof arctic.decodeIdToken).toBe('function')
  })

  it('still builds a GitHub authorize URL from (state, scopes)', async () => {
    const arctic = await loadArctic()
    const github = new arctic.GitHub('id', 'secret', 'https://api.test/cb')

    const url = github.createAuthorizationURL('the-state', ['read:user', 'user:email'])

    expect(url.origin).toBe('https://github.com')
    expect(url.searchParams.get('state')).toBe('the-state')
    expect(url.searchParams.get('scope')).toBe('read:user user:email')
    expect(url.searchParams.get('redirect_uri')).toBe('https://api.test/cb')
  })

  it('still builds a Google authorize URL from (state, verifier, scopes), with PKCE', async () => {
    const arctic = await loadArctic()
    const google = new arctic.Google('id', 'secret', 'https://api.test/cb')

    const url = google.createAuthorizationURL('the-state', 'the-verifier', ['openid', 'email'])

    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('state')).toBe('the-state')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toEqual(expect.any(String))
  })
})
