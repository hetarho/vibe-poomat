import { beforeEach, describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import { NOTIFICATION_TYPES, type NotificationType } from '../domain/notification-type'
import type { PreferenceRepository } from '../domain/preference.repository'
import { NotificationPreferencesUseCase } from './notification-preferences.use-case'
import { UnsubscribeToken } from './unsubscribe-token'

const USER = EntityId.generate().value
const SECRET = 'a-test-notification-secret-long-enough'

class InMemoryPreferences implements PreferenceRepository {
  readonly rows = new Map<string, Map<NotificationType, boolean>>()

  async settingsFor(userId: string): Promise<Map<NotificationType, boolean>> {
    return this.rows.get(userId) ?? new Map()
  }

  async set(userId: string, type: NotificationType, enabled: boolean): Promise<void> {
    const mine = this.rows.get(userId) ?? new Map<NotificationType, boolean>()
    mine.set(type, enabled)
    this.rows.set(userId, mine)
  }
}

describe('NotificationPreferencesUseCase (NOTI-3, NOTI-4)', () => {
  let preferences: InMemoryPreferences
  let tokens: UnsubscribeToken
  let useCase: NotificationPreferencesUseCase

  beforeEach(() => {
    preferences = new InMemoryPreferences()
    tokens = new UnsubscribeToken(SECRET)
    useCase = new NotificationPreferencesUseCase(preferences, tokens)
  })

  describe('reading them', () => {
    it('answers with every type, even before a row exists for any of them', async () => {
      const views = await useCase.list(USER)

      expect(views.map((view) => view.type)).toEqual([...NOTIFICATION_TYPES])
      expect(views.every((view) => view.enabled)).toBe(true)
    })

    it('marks only the warning as impossible to disable', async () => {
      const views = await useCase.list(USER)

      expect(views.filter((view) => !view.canDisable).map((view) => view.type)).toEqual([
        'auto_accept_warning',
      ])
    })

    it('shows a type somebody turned off as off', async () => {
      await preferences.set(USER, 'thread_reply', false)

      const views = await useCase.list(USER)

      expect(views.find((view) => view.type === 'thread_reply')?.enabled).toBe(false)
    })

    /**
     * A row could say the warning is off — an older build, or a hand-edited row.
     * The page must not promise silence it will not deliver.
     */
    it('shows the warning as on even if a row says otherwise', async () => {
      await preferences.set(USER, 'auto_accept_warning', false)

      const views = await useCase.list(USER)

      expect(views.find((view) => view.type === 'auto_accept_warning')?.enabled).toBe(true)
    })
  })

  describe('changing them', () => {
    it('turns one off and leaves the rest alone', async () => {
      const views = (await useCase.update(USER, { thread_reply: false }))._unsafeUnwrap()

      expect(views.find((view) => view.type === 'thread_reply')?.enabled).toBe(false)
      expect(views.filter((view) => view.type !== 'thread_reply').every((v) => v.enabled)).toBe(
        true,
      )
    })

    it('turns several at once', async () => {
      const views = (
        await useCase.update(USER, { thread_reply: false, mission_ended: false })
      )._unsafeUnwrap()

      expect(views.filter((view) => !view.enabled).map((view) => view.type)).toEqual([
        'thread_reply',
        'mission_ended',
      ])
    })

    it('refuses to disable the warning, and changes nothing else in the same call', async () => {
      const outcome = await useCase.update(USER, {
        auto_accept_warning: false,
        thread_reply: false,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('NOTIFICATION_ALWAYS_ON')
      expect(preferences.rows.get(USER)).toBeUndefined()
    })

    it('allows the warning to be set on, which is what it already is', async () => {
      expect((await useCase.update(USER, { auto_accept_warning: true })).isOk()).toBe(true)
    })
  })

  describe('unsubscribing from a link (NOTI-4)', () => {
    it('turns exactly the named type off', async () => {
      const token = tokens.sign({ userId: USER, type: 'feedback_accepted' })

      const done = (await useCase.unsubscribe(token))._unsafeUnwrap()

      expect(done).toEqual({ userId: USER, type: 'feedback_accepted' })
      const views = await useCase.list(USER)
      expect(views.filter((view) => !view.enabled).map((view) => view.type)).toEqual([
        'feedback_accepted',
      ])
    })

    it('refuses a tampered link and changes nothing', async () => {
      const outcome = await useCase.unsubscribe('not.atoken')

      expect(outcome._unsafeUnwrapErr().code).toBe('UNSUBSCRIBE_TOKEN_NOT_ALLOWED')
      expect(preferences.rows.get(USER)).toBeUndefined()
    })

    it('refuses a link signed by another deployment', async () => {
      const elsewhere = new UnsubscribeToken('a-completely-different-secret-value-x')

      const outcome = await useCase.unsubscribe(
        elsewhere.sign({ userId: USER, type: 'thread_reply' }),
      )

      expect(outcome._unsafeUnwrapErr().code).toBe('UNSUBSCRIBE_TOKEN_NOT_ALLOWED')
    })

    /** The link is one-way: it may switch a type off and can never switch one on. */
    it('refuses a link for the type that cannot be switched off', async () => {
      const token = tokens.sign({ userId: USER, type: 'auto_accept_warning' })

      expect((await useCase.unsubscribe(token))._unsafeUnwrapErr().code).toBe(
        'NOTIFICATION_ALWAYS_ON',
      )
    })

    it('is idempotent: clicking the same link twice leaves it off', async () => {
      const token = tokens.sign({ userId: USER, type: 'thread_reply' })
      await useCase.unsubscribe(token)

      expect((await useCase.unsubscribe(token)).isOk()).toBe(true)
      expect((await useCase.list(USER)).find((v) => v.type === 'thread_reply')?.enabled).toBe(false)
    })
  })
})
