import type { CookieSerializeOptions } from '@fastify/cookie'
import {
  clearedSessionCookieOptions,
  SESSION_COOKIE,
  SESSION_COOKIE_ATTRIBUTES,
} from '../../shared/presentation/session-cookie'
import { SESSION_IDLE_LIFETIME_MS } from '../domain/session'

// re-exported so the auth routes keep one import for every cookie they touch;
// the name and attributes live in shared because AUTH-9's deletion, which is not
// in this context, has to clear the very same cookie
export { clearedSessionCookieOptions, SESSION_COOKIE }

/** AUTH-8's idle lifetime, in the unit `Set-Cookie` speaks. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_IDLE_LIFETIME_MS / 1000

export const sessionCookieOptions: CookieSerializeOptions = {
  ...SESSION_COOKIE_ATTRIBUTES,
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
}

export const OAUTH_STATE_COOKIE = 'oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'oauth_verifier'
export const OAUTH_RETURN_TO_COOKIE = 'oauth_return_to'

/** Long enough for a slow consent screen, short enough to be worthless if stolen. */
export const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60

/** Scoped to the auth routes, which is everywhere these are ever read. */
export const oauthCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
}

/** Clearing has to repeat path and attributes, or the browser keeps the original. */
export const clearedOauthCookieOptions: CookieSerializeOptions = {
  ...oauthCookieOptions,
  maxAge: 0,
}
