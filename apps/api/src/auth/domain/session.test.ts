import { describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import { SESSION_IDLE_LIFETIME_MS, SESSION_TOUCH_INTERVAL_MS, Session } from './session'
import { SessionId } from './session-id'

const ID = SessionId.parse('a'.repeat(43))._unsafeUnwrap()
const START = new Date('2026-01-01T00:00:00.000Z')

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs)
}

function start(): Session {
  return Session.start({ id: ID, userId: EntityId.generate(), now: START })
}

describe('Session.start', () => {
  it('opens a 30-day idle window (AUTH-8)', () => {
    const session = start()

    expect(session.createdAt).toEqual(START)
    expect(session.lastSeenAt).toEqual(START)
    expect(session.expiresAt).toEqual(at(SESSION_IDLE_LIFETIME_MS))
  })
})

describe('Session.isExpired', () => {
  it('is false right up to the expiry instant and true at it', () => {
    const session = start()

    expect(session.isExpired(at(SESSION_IDLE_LIFETIME_MS - 1))).toBe(false)
    expect(session.isExpired(at(SESSION_IDLE_LIFETIME_MS))).toBe(true)
  })
})

describe('Session.touch', () => {
  it('does nothing inside the touch interval, so a request pays for no write', () => {
    const session = start()

    expect(session.touch(at(SESSION_TOUCH_INTERVAL_MS - 1))).toBe(false)
    expect(session.lastSeenAt).toEqual(START)
    expect(session.expiresAt).toEqual(at(SESSION_IDLE_LIFETIME_MS))
  })

  it('slides the whole window once the interval has passed', () => {
    const session = start()
    const now = at(SESSION_TOUCH_INTERVAL_MS)

    expect(session.touch(now)).toBe(true)
    expect(session.lastSeenAt).toEqual(now)
    expect(session.expiresAt).toEqual(new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS))
  })

  it('keeps someone signed in indefinitely while they keep coming back', () => {
    const session = start()
    let now = START

    for (let day = 1; day <= 90; day++) {
      now = at(day * 24 * 60 * 60 * 1000)
      expect(session.isExpired(now)).toBe(false)
      expect(session.touch(now)).toBe(true)
    }

    expect(session.expiresAt).toEqual(new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS))
  })

  it('never revives a session that has already lapsed', () => {
    const session = start()
    const lapsed = at(SESSION_IDLE_LIFETIME_MS + 1)

    expect(session.touch(lapsed)).toBe(false)
    expect(session.isExpired(lapsed)).toBe(true)
  })
})

describe('Session identity', () => {
  it('is the cookie value, not the account it belongs to', () => {
    const first = start()
    const second = Session.start({ id: ID, userId: EntityId.generate(), now: START })
    const other = Session.start({
      id: SessionId.parse('b'.repeat(43))._unsafeUnwrap(),
      userId: first.userId,
      now: START,
    })

    expect(first.equals(second)).toBe(true)
    expect(first.equals(other)).toBe(false)
    expect(first.equals(null)).toBe(false)
  })
})

describe('Session.restore', () => {
  it('copies the props, so the stored row cannot be mutated through the entity', () => {
    const props = {
      userId: EntityId.generate(),
      createdAt: START,
      lastSeenAt: START,
      expiresAt: at(SESSION_IDLE_LIFETIME_MS),
    }
    const session = Session.restore(ID, props)

    session.touch(at(SESSION_TOUCH_INTERVAL_MS))

    expect(props.lastSeenAt).toEqual(START)
    expect(session.lastSeenAt).toEqual(at(SESSION_TOUCH_INTERVAL_MS))
  })
})
