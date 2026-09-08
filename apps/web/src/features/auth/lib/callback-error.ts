/**
 * What the callback can send back on `?error=` (T018), turned into a sentence.
 * The code is the api's contract (ARCH-17); the wording is a UI decision, which
 * is why it lives here and not there.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  AUTH_PROVIDER_DENIED: 'You cancelled the sign-in, or the provider refused it.',
  AUTH_STATE_MISMATCH: 'That sign-in did not start here. Try again from this page.',
  AUTH_PROVIDER_EXCHANGE_FAILED: 'The provider did not complete the sign-in. Try again.',
  AUTH_PROVIDER_EMAIL_UNVERIFIED:
    'That provider account has no verified email address. Verify it with the provider, or use the other one.',
  AUTH_PROVIDER_NOT_CONFIGURED: 'That way in is not available right now. Try the other one.',
  AUTH_UNKNOWN_PROVIDER: 'That is not a sign-in method we offer.',
  AUTH_IDENTITY_ALREADY_LINKED: 'That provider account is already attached to another account.',
}

export const FALLBACK_SIGN_IN_ERROR = 'Sign-in did not work. Try again.'

export function signInErrorMessage(code: string | null | undefined): string | null {
  if (typeof code !== 'string' || code.trim().length === 0) return null

  return MESSAGE_BY_CODE[code] ?? FALLBACK_SIGN_IN_ERROR
}

export function isKnownSignInErrorCode(code: string): boolean {
  return code in MESSAGE_BY_CODE
}
