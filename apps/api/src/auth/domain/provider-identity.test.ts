import { describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import { ProviderIdentity } from './provider-identity'

const userId = EntityId.generate()

function create(overrides: Partial<Parameters<typeof ProviderIdentity.create>[0]> = {}) {
  return ProviderIdentity.create({
    userId,
    provider: 'github',
    providerUserId: '4242',
    email: 'Ada@Example.com',
    emailVerified: true,
    ...overrides,
  })
}

describe('ProviderIdentity.create', () => {
  it('keeps what the provider told us about the account', () => {
    const identity = create()._unsafeUnwrap()

    expect(identity.provider).toBe('github')
    expect(identity.providerUserId).toBe('4242')
    expect(identity.emailVerified).toBe(true)
    expect(identity.userId.equals(userId)).toBe(true)
  })

  it('lowercases the email, so AUTH-5 never turns on the casing a provider sent', () => {
    expect(create()._unsafeUnwrap().email).toBe('ada@example.com')
  })

  it.each(['facebook', 'GitHub', ''])('rejects %j as a provider (AUTH-1)', (provider) => {
    expect(create({ provider })._unsafeUnwrapErr().code).toBe('AUTH_UNKNOWN_PROVIDER')
  })

  it.each([
    ['providerUserId', { providerUserId: '  ' }],
    ['email', { email: '  ' }],
  ])('rejects a blank %s', (_field, overrides) => {
    expect(create(overrides).isErr()).toBe(true)
  })

  it('accepts an unverified email, which AUTH-5 then refuses to link on', () => {
    const identity = create({ emailVerified: false })._unsafeUnwrap()

    expect(identity.emailVerified).toBe(false)
  })
})
