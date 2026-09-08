import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import {
  type DomainEventHandler,
  MISSION_READER,
  type MissionReader,
} from '../../shared/application'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import {
  announcesMissionEnd,
  announcesSettlement,
  announcesSubmission,
  announcesThreadReply,
  announcesWarning,
  CROSS_CONTEXT_EVENTS,
  type DomainEvent,
  isRejectionReason,
} from '../../shared/kernel'
import { SendNotificationUseCase } from '../application/send-notification.use-case'

/*
 * NOTI-2's five subscriptions. Each is a plain class rather than a subclass of a
 * shared base: a subclass with no constructor of its own emits no
 * `design:paramtypes`, and Nest then cannot build it. Three lines of repetition
 * buy a graph that always resolves.
 *
 * None of them owns a rule. They read what another context announced and ask for
 * an email, which is what keeps mail out of the transaction that settled a
 * credit (ARCH-39).
 */

/** NOTI-2: a report landed, and the maker is the one who has to answer it. */
@Injectable()
export class NotifyOnFeedbackSubmitted implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.feedbackSubmitted

  constructor(
    private readonly notifications: SendNotificationUseCase,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!announcesSubmission(event)) return

    await this.notifications.notify({
      type: 'feedback_received',
      userId: event.makerId,
      feedbackId: event.aggregateId.value,
    })
  }
}

/** NOTI-2: the other side of FDBK-5's two-party thread, never the one who wrote. */
@Injectable()
export class NotifyOnThreadReplied implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.threadReplied

  constructor(
    private readonly notifications: SendNotificationUseCase,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!announcesThreadReply(event)) return

    await this.notifications.notify({
      type: 'thread_reply',
      userId: event.recipientId,
      feedbackId: event.feedbackId,
    })
  }
}

/**
 * NOTI-2's three settlement emails, which are one event apart: the maker's yes,
 * the maker's no, and the clock's yes. Only the last reaches both people.
 */
@Injectable()
export class NotifyOnSlotSettled implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.slotSettled

  constructor(
    private readonly notifications: SendNotificationUseCase,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!announcesSettlement(event)) return

    const feedbackId = event.aggregateId.value

    if (event.automatic) {
      // FDBK-7 decided it, so both sides are told what happened to them
      await this.notifications.notify({
        type: 'auto_accepted',
        userId: event.makerId,
        feedbackId,
        role: 'maker',
      })
      await this.notifications.notify({
        type: 'auto_accepted',
        userId: event.feedbackerId,
        feedbackId,
        role: 'feedbacker',
      })

      return
    }

    if (event.outcome === 'accepted') {
      await this.notifications.notify({
        type: 'feedback_accepted',
        userId: event.feedbackerId,
        feedbackId,
      })

      return
    }

    await this.notifications.notify({
      type: 'feedback_rejected',
      userId: event.feedbackerId,
      feedbackId,
      // a reason outside FDBK-6's fixed list cannot be put into a sentence, so
      // the email says the decision without inventing a justification for it
      reason: isRejectionReason(event.rejectionReason) ? event.rejectionReason : null,
    })
  }
}

/** NOTI-2 and NOTI-3: the 48-hour nudge, which nobody may switch off. */
@Injectable()
export class NotifyOnAutoAcceptWarning implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.autoAcceptWarning

  constructor(
    private readonly notifications: SendNotificationUseCase,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!announcesWarning(event)) return

    await this.notifications.notify({
      type: 'auto_accept_warning',
      userId: event.makerId,
      feedbackId: event.aggregateId.value,
    })
  }
}

/**
 * NOTI-2's refund summary. The mission event names the project but not its
 * owner, so the owner is asked for through the project context's own port rather
 * than by reaching into its tables (ARCH-14).
 */
@Injectable()
export class NotifyOnMissionEnded implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.missionEnded

  constructor(
    private readonly notifications: SendNotificationUseCase,
    private readonly registry: DomainEventRegistry,
    @Inject(MISSION_READER) private readonly missions: MissionReader,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!announcesMissionEnd(event)) return

    const mission = await this.missions.forClaim(event.aggregateId.value)
    if (mission === null) return

    await this.notifications.notify({
      type: 'mission_ended',
      userId: mission.ownerId,
      projectId: event.projectId,
      ending: endingOf(event.state),
      refundedSlots: event.refundedSlots,
    })
  }
}

function endingOf(state: string): 'completed' | 'expired' | 'closed' {
  if (state === 'completed') return 'completed'
  if (state === 'expired') return 'expired'

  return 'closed'
}

export const NOTIFICATION_HANDLERS = [
  NotifyOnFeedbackSubmitted,
  NotifyOnThreadReplied,
  NotifyOnSlotSettled,
  NotifyOnAutoAcceptWarning,
  NotifyOnMissionEnded,
] as const
