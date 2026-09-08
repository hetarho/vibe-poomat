import type { CookieSerializeOptions } from '@fastify/cookie'

export const SESSION_COOKIE = 'session'

/**
 * The session cookie's name and attributes, which are a transport fact rather
 * than an `auth` one: any route that ends a session has to clear the very same
 * cookie, and AUTH-9's deletion is not in the auth context.
 *
 * How long it lives is a different question — that is AUTH-8, and it stays with
 * the session aggregate that decides it.
 *
 * `SameSite=Lax` carries the cookie on a top-level GET, which a provider
 * redirect is, but not on the cross-site POST that is the CSRF shape. `Secure`
 * is unconditional; browsers treat localhost as a secure origin, so development
 * needs no exception that could survive into production.
 */
export const SESSION_COOKIE_ATTRIBUTES: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
}

/**
 * Clearing has to repeat path and attributes, or the browser keeps the original.
 * It needs no lifetime, which is why it can live here at all.
 */
export const clearedSessionCookieOptions: CookieSerializeOptions = {
  ...SESSION_COOKIE_ATTRIBUTES,
  maxAge: 0,
}
