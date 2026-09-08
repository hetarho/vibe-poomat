import type { auth } from '@repo/contracts'

/** AUTH-1's two ways in, and there is deliberately no third. */
export const SIGN_IN_PROVIDERS = [
  { id: 'github', label: 'Continue with GitHub' },
  { id: 'google', label: 'Continue with Google' },
] as const satisfies readonly { id: auth.AuthProvider; label: string }[]

export const SIGN_IN_PATH = '/sign-in'

const DEFAULT_RETURN_TO = '/'

/**
 * The api decides what a safe `returnTo` is (it ends up in a `Location` header),
 * so this only has to send something sane: a path on this site, encoded once.
 * Anything else is dropped here rather than argued about there.
 */
export function safeReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return DEFAULT_RETURN_TO

  const value = raw.trim()
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_RETURN_TO

  return value
}

/**
 * A full-page link rather than a fetch: OAuth is a browser redirect, and the
 * cookies the api sets on the way have to reach the browser that started it.
 */
export function signInUrl(provider: auth.AuthProvider, returnTo: string | null): string {
  return `/api/v1/auth/${provider}?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}
