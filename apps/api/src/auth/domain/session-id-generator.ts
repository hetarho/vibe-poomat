import type { SessionId } from './session-id'

export const SESSION_ID_GENERATOR = Symbol('SESSION_ID_GENERATOR')

/**
 * Minting a session id is the one thing about a session that must not be
 * predictable, and the one thing a test must be able to pin down. A port keeps
 * both true: the domain never reaches for a random source itself.
 */
export type SessionIdGenerator = {
  next(): SessionId
}
