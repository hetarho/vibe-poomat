import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionForClaim, MissionReader } from '../../shared/application'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import { CROSS_CONTEXT_EVENTS, type DomainEvent, EntityId } from '../../shared/kernel'
import type {
  NotificationRequest,
  SendNotificationUseCase,
} from '../application/send-notification.use-case'
import {
  NOTIFICATION_HANDLERS,
  NotifyOnAutoAcceptWarning,
  NotifyOnFeedbackSubmitted,
  NotifyOnMissionEnded,
  NotifyOnSlotSettled,
  NotifyOnThreadReplied,
} from './notification-handlers'

const FEEDBACK = EntityId.generate()
const REPLY = EntityId.generate()
const MISSION = EntityId.generate()
const PROJECT = EntityId.generate()
const MAKER = EntityId.generate().value
const FEEDBACKER = EntityId.generate().value

/** A published event as a subscriber sees it: an aggregate id and the fields it announces. */
function event(aggregateId: EntityId, name: string, fields: Record<string, unknown>): DomainEvent {
  return { aggregateId, name, occurredAt: new Date(), ...fields } as unknown as DomainEvent
}

const mission: MissionForClaim = {
  id: MISSION.value,
  projectId: PROJECT.value,
  ownerId: MAKER,
  slots: 1,
  questions: [],
  isOpen: false,
}

describe('the NOTI-2 handlers', () => {
  let notify: ReturnType<typeof vi.fn>
  let notifications: SendNotificationUseCase
  let registry: DomainEventRegistry
  let missions: MissionReader

  beforeEach(() => {
    notify = vi.fn(async () => undefined)
    notifications = { notify } as unknown as SendNotificationUseCase
    registry = new DomainEventRegistry()
    missions = { forClaim: async () => mission }
  })

  function sent(index = 0): NotificationRequest {
    return notify.mock.calls[index]?.[0] as NotificationRequest
  }

  describe('registration', () => {
    it('every handler puts itself on the bus, so adding one changes no central list', () => {
      new NotifyOnFeedbackSubmitted(notifications, registry).onModuleInit()
      new NotifyOnThreadReplied(notifications, registry).onModuleInit()
      new NotifyOnSlotSettled(notifications, registry).onModuleInit()
      new NotifyOnAutoAcceptWarning(notifications, registry).onModuleInit()
      new NotifyOnMissionEnded(notifications, registry, missions).onModuleInit()

      for (const name of [
        CROSS_CONTEXT_EVENTS.feedbackSubmitted,
        CROSS_CONTEXT_EVENTS.threadReplied,
        CROSS_CONTEXT_EVENTS.slotSettled,
        CROSS_CONTEXT_EVENTS.autoAcceptWarning,
        CROSS_CONTEXT_EVENTS.missionEnded,
      ]) {
        expect(registry.handlersFor(name)).toHaveLength(1)
      }
    })

    it('covers all five published events', () => {
      expect(NOTIFICATION_HANDLERS).toHaveLength(5)
    })
  })

  describe('a report landing (FDBK-3)', () => {
    it('tells the maker, who is the one who has to answer it', async () => {
      const handler = new NotifyOnFeedbackSubmitted(notifications, registry)

      await handler.handle(
        event(FEEDBACK, CROSS_CONTEXT_EVENTS.feedbackSubmitted, {
          missionId: MISSION.value,
          projectId: PROJECT.value,
          makerId: MAKER,
          feedbackerId: FEEDBACKER,
        }),
      )

      expect(sent()).toEqual({
        type: 'feedback_received',
        userId: MAKER,
        feedbackId: FEEDBACK.value,
      })
    })

    it('says nothing for an event missing what it publishes', async () => {
      const handler = new NotifyOnFeedbackSubmitted(notifications, registry)

      await handler.handle(event(FEEDBACK, CROSS_CONTEXT_EVENTS.feedbackSubmitted, {}))

      expect(notify).not.toHaveBeenCalled()
    })
  })

  describe('a thread reply (FDBK-5)', () => {
    it('tells the other participant, never the one who wrote it', async () => {
      const handler = new NotifyOnThreadReplied(notifications, registry)

      await handler.handle(
        event(REPLY, CROSS_CONTEXT_EVENTS.threadReplied, {
          feedbackId: FEEDBACK.value,
          authorId: MAKER,
          recipientId: FEEDBACKER,
        }),
      )

      expect(sent()).toEqual({
        type: 'thread_reply',
        userId: FEEDBACKER,
        feedbackId: FEEDBACK.value,
      })
    })
  })

  describe('a settlement (FDBK-6, FDBK-7)', () => {
    function settled(fields: Record<string, unknown>): DomainEvent {
      return event(FEEDBACK, CROSS_CONTEXT_EVENTS.slotSettled, {
        missionId: MISSION.value,
        projectId: PROJECT.value,
        makerId: MAKER,
        feedbackerId: FEEDBACKER,
        rejectionReason: null,
        ...fields,
      })
    }

    it('tells the feedbacker when the maker accepted', async () => {
      const handler = new NotifyOnSlotSettled(notifications, registry)

      await handler.handle(settled({ outcome: 'accepted', automatic: false }))

      expect(notify).toHaveBeenCalledTimes(1)
      expect(sent()).toEqual({
        type: 'feedback_accepted',
        userId: FEEDBACKER,
        feedbackId: FEEDBACK.value,
      })
    })

    it('tells the feedbacker why when the maker rejected', async () => {
      const handler = new NotifyOnSlotSettled(notifications, registry)

      await handler.handle(
        settled({ outcome: 'rejected', automatic: false, rejectionReason: 'no_substance' }),
      )

      expect(sent()).toEqual({
        type: 'feedback_rejected',
        userId: FEEDBACKER,
        feedbackId: FEEDBACK.value,
        reason: 'no_substance',
      })
    })

    it('drops a reason that is not one of FDBK-6’s three', async () => {
      const handler = new NotifyOnSlotSettled(notifications, registry)

      await handler.handle(
        settled({ outcome: 'rejected', automatic: false, rejectionReason: 'because-i-said-so' }),
      )

      expect(sent()).toMatchObject({ type: 'feedback_rejected', reason: null })
    })

    it('tells both sides when the clock decided, each in their own words', async () => {
      const handler = new NotifyOnSlotSettled(notifications, registry)

      await handler.handle(settled({ outcome: 'accepted', automatic: true }))

      expect(notify).toHaveBeenCalledTimes(2)
      expect(sent(0)).toEqual({
        type: 'auto_accepted',
        userId: MAKER,
        feedbackId: FEEDBACK.value,
        role: 'maker',
      })
      expect(sent(1)).toEqual({
        type: 'auto_accepted',
        userId: FEEDBACKER,
        feedbackId: FEEDBACK.value,
        role: 'feedbacker',
      })
    })

    it('sends no acceptance email as well as the auto-accept pair', async () => {
      const handler = new NotifyOnSlotSettled(notifications, registry)

      await handler.handle(settled({ outcome: 'accepted', automatic: true }))

      expect(notify.mock.calls.map((call) => (call[0] as NotificationRequest).type)).toEqual([
        'auto_accepted',
        'auto_accepted',
      ])
    })
  })

  describe('the 48-hour warning (FDBK-7)', () => {
    it('tells the maker, whose credit is about to move', async () => {
      const handler = new NotifyOnAutoAcceptWarning(notifications, registry)

      await handler.handle(
        event(FEEDBACK, CROSS_CONTEXT_EVENTS.autoAcceptWarning, {
          missionId: MISSION.value,
          makerId: MAKER,
        }),
      )

      expect(sent()).toEqual({
        type: 'auto_accept_warning',
        userId: MAKER,
        feedbackId: FEEDBACK.value,
      })
    })
  })

  describe('a mission ending (PROJ-6)', () => {
    function ended(state: string, refundedSlots: number): DomainEvent {
      return event(MISSION, CROSS_CONTEXT_EVENTS.missionEnded, {
        projectId: PROJECT.value,
        state,
        refundedSlots,
      })
    }

    it.each([
      ['completed', 'completed'],
      ['expired', 'expired'],
      ['closed', 'closed'],
    ])('tells the owner that it %s, with the refund summary', async (state, ending) => {
      const handler = new NotifyOnMissionEnded(notifications, registry, missions)

      await handler.handle(ended(state, 2))

      expect(sent()).toEqual({
        type: 'mission_ended',
        userId: MAKER,
        projectId: PROJECT.value,
        ending,
        refundedSlots: 2,
      })
    })

    it('says zero refunded when every slot was used', async () => {
      const handler = new NotifyOnMissionEnded(notifications, registry, missions)

      await handler.handle(ended('completed', 0))

      expect(sent()).toMatchObject({ refundedSlots: 0 })
    })

    /** The owner comes through the project context's port, never a join (ARCH-14). */
    it('says nothing when the mission cannot be read any more', async () => {
      const handler = new NotifyOnMissionEnded(notifications, registry, {
        forClaim: async () => null,
      })

      await handler.handle(ended('expired', 1))

      expect(notify).not.toHaveBeenCalled()
    })
  })
})
