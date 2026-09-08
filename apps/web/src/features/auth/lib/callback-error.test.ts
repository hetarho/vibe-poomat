import { describe, expect, it } from 'vitest'
import {
  FALLBACK_SIGN_IN_ERROR,
  isKnownSignInErrorCode,
  signInErrorMessage,
} from './callback-error'

/** Every code the callback can redirect with (T018). */
const CALLBACK_CODES = [
  'AUTH_PROVIDER_DENIED',
  'AUTH_STATE_MISMATCH',
  'AUTH_PROVIDER_EXCHANGE_FAILED',
  'AUTH_PROVIDER_EMAIL_UNVERIFIED',
  'AUTH_PROVIDER_NOT_CONFIGURED',
  'AUTH_UNKNOWN_PROVIDER',
  'AUTH_IDENTITY_ALREADY_LINKED',
] as const

describe('signInErrorMessage', () => {
  it.each(CALLBACK_CODES)('has a sentence of its own for %s', (code) => {
    const message = signInErrorMessage(code)

    expect(isKnownSignInErrorCode(code)).toBe(true)
    expect(message).not.toBeNull()
    expect(message).not.toBe(FALLBACK_SIGN_IN_ERROR)
    expect((message as string).length).toBeGreaterThan(10)
  })

  /** AUTH-5's awkward case: the provider will not say the address is theirs. */
  it('explains the unverified-email case well enough to act on', () => {
    const message = signInErrorMessage('AUTH_PROVIDER_EMAIL_UNVERIFIED') as string

    expect(message).toContain('verified email')
    expect(message).toContain('other one')
  })

  it('falls back for a code this build has never heard of', () => {
    expect(signInErrorMessage('AUTH_SOMETHING_NEW')).toBe(FALLBACK_SIGN_IN_ERROR)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '   '],
  ])('says nothing at all for %s, because nothing went wrong', (_name, code) => {
    expect(signInErrorMessage(code)).toBeNull()
  })

  it('never echoes the code back at the reader', () => {
    expect(signInErrorMessage('AUTH_PROVIDER_DENIED')).not.toContain('AUTH_')
  })
})
