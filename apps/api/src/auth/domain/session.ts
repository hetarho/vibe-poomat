import type { EntityId } from '../../shared/kernel'
import type { SessionId } from './session-id'

/** AUTH-8: signed in until logout or 30 days idle. */
export const SESSION_IDLE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

/**
 * How stale `last_seen_at` may get before a request pays for an UPDATE. Sliding
 * the window on literally every request would mean one write per request for a
 * window measured in weeks.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000

type SessionProps = {
  userId: EntityId
  createdAt: Date
  lastSeenAt: Date
  expiresAt: Date
}

/**
 * A signed-in browser. Identity here is the opaque cookie value itself, not a
 * UUIDv7, so this deliberately does not extend the shared `Entity`: that base
 * class exists to give UUID-identified rows their equality, and a session's id
 * is a secret rather than a key anyone may quote.
 */
export class Session {
  private constructor(
    readonly id: SessionId,
    private props: SessionProps,
  ) {}

  static start(input: { id: SessionId; userId: EntityId; now?: Date }): Session {
    const now = input.now ?? new Date()

    return new Session(input.id, {
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS),
    })
  }

  /** Rebuilds a stored row. The database is trusted; the cookie is not. */
  static restore(id: SessionId, props: SessionProps): Session {
    return new Session(id, { ...props })
  }

  get userId(): EntityId {
    return this.props.userId
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get lastSeenAt(): Date {
    return this.props.lastSeenAt
  }

  get expiresAt(): Date {
    return this.props.expiresAt
  }

  isExpired(now: Date = new Date()): boolean {
    return now.getTime() >= this.props.expiresAt.getTime()
  }

  /**
   * Slides the 30-day idle window forward. Returns whether anything actually
   * moved, which is what lets the caller skip the write: a no-op inside the
   * touch interval, and never a revival of a session that has already lapsed.
   */
  touch(now: Date = new Date()): boolean {
    if (this.isExpired(now)) return false
    if (now.getTime() - this.props.lastSeenAt.getTime() < SESSION_TOUCH_INTERVAL_MS) return false

    this.props = {
      ...this.props,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS),
    }

    return true
  }

  equals(other?: Session | null): boolean {
    if (other === null || other === undefined) return false

    return other.id.equals(this.id)
  }
}
