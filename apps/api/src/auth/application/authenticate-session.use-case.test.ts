import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EntityId } from '../../shared/kernel'
import { SESSION_IDLE_LIFETIME_MS, SESSION_TOUCH_INTERVAL_MS, Session } from '../domain/session'
import { SessionId } from '../domain/session-id'
import { InMemorySessionRepository } from '../test-support/in-memory-repositories'
import { AuthenticateSessionUseCase } from './authenticate-session.use-case'

const ID = SessionId.parse('a'.repeat(43))._unsafeUnwrap()
const START = new Date('2026-01-01T00:00:00.000Z')
const userId = EntityId.generate()

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs)
}

describe('AuthenticateSessionUseCase', () => {
  let sessions: InMemorySessionRepository
  let useCase: AuthenticateSessionUseCase

  beforeEach(async () => {
    sessions = new InMemorySessionRepository()
    useCase = new AuthenticateSessionUseCase(sessions)
    await sessions.save(Session.start({ id: ID, userId, now: START }))
  })

  it('answers with the account behind a live session', async () => {
    const caller = await useCase.execute({ sessionId: ID, now: at(1000) })

    expect(caller._unsafeUnwrap().userId).toBe(userId.value)
  })

  it('refuses a cookie naming no row', async () => {
    const stranger = SessionId.parse('b'.repeat(43))._unsafeUnwrap()

    expect((await useCase.execute({ sessionId: stranger }))._unsafeUnwrapErr().code).toBe(
      'UNAUTHENTICATED',
    )
  })

  it('refuses a session past its expiry, and leaves the row for the sweep', async () => {
    const outcome = await useCase.execute({ sessionId: ID, now: at(SESSION_IDLE_LIFETIME_MS) })

    expect(outcome._unsafeUnwrapErr().code).toBe('UNAUTHENTICATED')
    expect(await sessions.findById(ID)).not.toBeNull()
  })

  describe('sliding the window (AUTH-8)', () => {
    it('writes nothing for two requests inside the touch interval', async () => {
      const save = vi.spyOn(sessions, 'save')

      await useCase.execute({ sessionId: ID, now: at(1000) })
      await useCase.execute({ sessionId: ID, now: at(SESSION_TOUCH_INTERVAL_MS - 1) })

      expect(save).not.toHaveBeenCalled()
    })

    it('writes once for a request past the interval', async () => {
      const save = vi.spyOn(sessions, 'save')
      const now = at(SESSION_TOUCH_INTERVAL_MS)

      await useCase.execute({ sessionId: ID, now })

      expect(save).toHaveBeenCalledOnce()
      expect((await sessions.findById(ID))?.expiresAt).toEqual(
        new Date(now.getTime() + SESSION_IDLE_LIFETIME_MS),
      )
    })

    it('writes again only after another interval has passed', async () => {
      await useCase.execute({ sessionId: ID, now: at(SESSION_TOUCH_INTERVAL_MS) })
      const save = vi.spyOn(sessions, 'save')

      await useCase.execute({ sessionId: ID, now: at(SESSION_TOUCH_INTERVAL_MS + 1) })
      expect(save).not.toHaveBeenCalled()

      await useCase.execute({ sessionId: ID, now: at(2 * SESSION_TOUCH_INTERVAL_MS) })
      expect(save).toHaveBeenCalledOnce()
    })
  })
})
