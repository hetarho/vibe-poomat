import type { CookieSerializeOptions } from '@fastify/cookie'
import { SESSION_IDLE_LIFETIME_MS } from '../domain/session'

export const SESSION_COOKIE = 'session'
export const OAUTH_STATE_COOKIE = 'oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'oauth_verifier'
export const OAUTH_RETURN_TO_COOKIE = 'oauth_return_to'

/** Long enough for a slow consent screen, short enough to be worthless if stolen. */
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60

export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_IDLE_LIFETIME_MS / 1000

/**
 * `SameSite=Lax` is exactly right for both: a provider redirect is a top-level
 * GET, which Lax still carries, while a cross-site POST — the CSRF shape — is
 * not. `Secure` is unconditional; browsers treat localhost as a secure origin,
 * so development needs no exception that could survive into production.
 */
const BASE: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
}

export const sessionCookieOptions: CookieSerializeOptions = {
  ...BASE,
  path: '/',
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
}

/** Scoped to the auth routes, which is everywhere these are ever read. */
export const oauthCookieOptions: CookieSerializeOptions = {
  ...BASE,
  path: '/api/v1/auth',
  maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
}

/** Clearing has to repeat path and attributes, or the browser keeps the original. */
export const clearedOauthCookieOptions: CookieSerializeOptions = {
  ...oauthCookieOptions,
  maxAge: 0,
}
