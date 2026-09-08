import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  JobScheduler,
  NotificationRecipient,
  NotificationRecipientReader,
} from '../../shared/application'
import { SEND_EMAIL_JOB } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { NOTIFICATION_TYPES, type NotificationType } from '../domain/notification-type'
import type { PreferenceRepository } from '../domain/preference.repository'
import { DeepLinks } from './deep-links'
import { SendNotificationUseCase } from './send-notification.use-case'
import { UnsubscribeToken } from './unsubscribe-token'

const USER = EntityId.generate().value
const FEEDBACK = EntityId.generate().value
const PROJECT = EntityId.generate().value

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

type QueuedMail = {
  to: string
  template: NotificationType
  props: {
    displayName: string
    ctaUrl: string
    unsubscribeUrl: string | null
    settingsUrl: string
    [key: string]: unknown
  }
}

describe('SendNotificationUseCase (NOTI-1, NOTI-3, NOTI-4)', () => {
  let preferences: InMemoryPreferences
  let enqueue: ReturnType<typeof vi.fn>
  let jobs: JobScheduler
  let recipient: NotificationRecipient | null
  let recipients: NotificationRecipientReader
  let useCase: SendNotificationUseCase

  beforeEach(() => {
    preferences = new InMemoryPreferences()
    enqueue = vi.fn(async () => undefined)
    jobs = {
      enqueue: enqueue as unknown as JobScheduler['enqueue'],
      schedule: async () => undefined,
      cancel: async () => undefined,
    }
    recipient = {
      userId: USER,
      email: 'ada@example.com',
      displayName: 'Ada',
      handle: 'ada',
    }
    recipients = { recipientFor: async () => recipient }
    useCase = new SendNotificationUseCase(
      recipients,
      preferences,
      jobs,
      new DeepLinks(
        'http://localhost:3000',
        'http://localhost:3001',
        new UnsubscribeToken('a-test-notification-secret-long-enough'),
      ),
    )
  })

  function queued(index = 0): QueuedMail {
    return enqueue.mock.calls[index]?.[1] as QueuedMail
  }

  describe('addressing it', () => {
    it('sends to the address the auth context resolved (AUTH-4)', async () => {
      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledTimes(1)
      expect(enqueue.mock.calls[0]?.[0]).toBe(SEND_EMAIL_JOB)
      expect(queued().to).toBe('ada@example.com')
      expect(queued().props.displayName).toBe('Ada')
    })

    /** AUTH-9: a job queued before a deletion has nobody to reach. */
    it('sends nothing at all when the account is gone', async () => {
      recipient = null

      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).not.toHaveBeenCalled()
    })

    /** ARCH-36: nothing leaves the building inline. */
    it('enqueues rather than sending', async () => {
      await useCase.notify({ type: 'thread_reply', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledExactlyOnceWith(
        SEND_EMAIL_JOB,
        expect.anything(),
        expect.objectContaining({ singletonKey: expect.stringContaining('thread_reply') }),
      )
    })

    /** NOTI-1: one email per event, so a redelivery finds the job already there. */
    it('keys the job on the type, the recipient and the item', async () => {
      await useCase.notify({ type: 'thread_reply', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue.mock.calls[0]?.[2]).toEqual({
        singletonKey: `noti:thread_reply:${USER}:${FEEDBACK}`,
      })
    })
  })

  describe('the opt-out (NOTI-3)', () => {
    it('sends when nobody has ever touched the setting', async () => {
      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledTimes(1)
    })

    it('stays quiet once the type is turned off', async () => {
      await preferences.set(USER, 'feedback_received', false)

      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).not.toHaveBeenCalled()
    })

    it('sends again once it is turned back on', async () => {
      await preferences.set(USER, 'feedback_received', false)
      await preferences.set(USER, 'feedback_received', true)

      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledTimes(1)
    })

    it('turning one type off leaves the others alone', async () => {
      await preferences.set(USER, 'feedback_received', false)

      await useCase.notify({ type: 'thread_reply', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledTimes(1)
    })

    /** The warning moves credits, so it is not somebody's to switch off. */
    it('sends the auto-accept warning even when it is marked disabled', async () => {
      await preferences.set(USER, 'auto_accept_warning', false)

      await useCase.notify({ type: 'auto_accept_warning', userId: USER, feedbackId: FEEDBACK })

      expect(enqueue).toHaveBeenCalledTimes(1)
    })
  })

  describe('the links every email carries (NOTI-4)', () => {
    it('deep-links to the report', async () => {
      await useCase.notify({ type: 'feedback_accepted', userId: USER, feedbackId: FEEDBACK })

      expect(queued().props.ctaUrl).toBe(`http://localhost:3000/feedbacks/${FEEDBACK}`)
    })

    it('deep-links to the project for a mission that ended', async () => {
      await useCase.notify({
        type: 'mission_ended',
        userId: USER,
        projectId: PROJECT,
        ending: 'expired',
        refundedSlots: 2,
      })

      expect(queued().props.ctaUrl).toBe(`http://localhost:3000/projects/${PROJECT}`)
    })

    it('carries a signed unsubscribe link back to this api', async () => {
      await useCase.notify({ type: 'thread_reply', userId: USER, feedbackId: FEEDBACK })

      expect(queued().props.unsubscribeUrl).toMatch(
        /^http:\/\/localhost:3001\/api\/v1\/notifications\/unsubscribe\?token=/,
      )
    })

    it('carries none for the type that cannot be switched off', async () => {
      await useCase.notify({ type: 'auto_accept_warning', userId: USER, feedbackId: FEEDBACK })

      expect(queued().props.unsubscribeUrl).toBeNull()
      expect(queued().props.settingsUrl).toBe('http://localhost:3000/settings/notifications')
    })

    it('always points at the settings page, whatever the type', async () => {
      for (const type of NOTIFICATION_TYPES) {
        enqueue.mockClear()
        await useCase.notify(
          type === 'mission_ended'
            ? { type, userId: USER, projectId: PROJECT, ending: 'closed', refundedSlots: 0 }
            : type === 'feedback_rejected'
              ? { type, userId: USER, feedbackId: FEEDBACK, reason: 'spam_abuse' }
              : type === 'auto_accepted'
                ? { type, userId: USER, feedbackId: FEEDBACK, role: 'maker' }
                : { type, userId: USER, feedbackId: FEEDBACK },
        )

        expect(queued().props.settingsUrl).toBe('http://localhost:3000/settings/notifications')
      }
    })
  })

  describe('what each template is handed', () => {
    it('gives the rejection its reason (FDBK-6)', async () => {
      await useCase.notify({
        type: 'feedback_rejected',
        userId: USER,
        feedbackId: FEEDBACK,
        reason: 'no_substance',
      })

      expect(queued().props.reason).toBe('no_substance')
    })

    it('gives the auto-accept the side it is written for', async () => {
      await useCase.notify({
        type: 'auto_accepted',
        userId: USER,
        feedbackId: FEEDBACK,
        role: 'feedbacker',
      })

      expect(queued().props.role).toBe('feedbacker')
    })

    it('gives the mission email its refund summary (CRED-5)', async () => {
      await useCase.notify({
        type: 'mission_ended',
        userId: USER,
        projectId: PROJECT,
        ending: 'completed',
        refundedSlots: 3,
      })

      expect(queued().props).toMatchObject({ ending: 'completed', refundedSlots: 3 })
    })

    it('names the template after the type, so a toggle and an email agree', async () => {
      await useCase.notify({ type: 'feedback_received', userId: USER, feedbackId: FEEDBACK })

      expect(queued().template).toBe('feedback_received')
    })
  })
})
