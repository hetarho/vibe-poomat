import type { EmailTemplateProps, MissionEndingKey, RejectionReasonKey } from '@repo/email'
import type { JobScheduler, NotificationRecipientReader } from '../../shared/application'
import { SEND_EMAIL_JOB } from '../../shared/application'
import { canBeDisabled, type NotificationType } from '../domain/notification-type'
import type { PreferenceRepository } from '../domain/preference.repository'
import type { DeepLinks } from './deep-links'

/**
 * One request per email. The shape is a discriminated union rather than a bag of
 * optional fields, so the compiler is what guarantees a rejection email is given
 * a reason and a mission email is given a refund count.
 */
export type NotificationRequest =
  | { type: 'feedback_received'; userId: string; feedbackId: string }
  | { type: 'thread_reply'; userId: string; feedbackId: string }
  | { type: 'feedback_accepted'; userId: string; feedbackId: string }
  | {
      type: 'feedback_rejected'
      userId: string
      feedbackId: string
      reason: RejectionReasonKey | null
    }
  | { type: 'auto_accept_warning'; userId: string; feedbackId: string }
  | {
      type: 'auto_accepted'
      userId: string
      feedbackId: string
      role: 'maker' | 'feedbacker'
    }
  | {
      type: 'mission_ended'
      userId: string
      projectId: string
      ending: MissionEndingKey
      refundedSlots: number
    }

/**
 * NOTI-1: one email per event, immediate, never batched. Everything the handlers
 * share lives here — resolving the address (AUTH-4), honouring the opt-out
 * (NOTI-3) and enqueueing rather than sending (ARCH-36) — so a new event type is
 * a handler and a template, and no new policy.
 *
 * The send is a job, which means this returns before anything leaves the
 * building: a mail outage must not fail the credit settlement that caused it.
 */
export class SendNotificationUseCase {
  constructor(
    private readonly recipients: NotificationRecipientReader,
    private readonly preferences: PreferenceRepository,
    private readonly jobs: JobScheduler,
    private readonly links: DeepLinks,
  ) {}

  async notify(request: NotificationRequest): Promise<void> {
    // a job queued before the account was deleted (AUTH-9) has nobody to reach,
    // which is finished work rather than a failure to retry
    const recipient = await this.recipients.recipientFor(request.userId)
    if (recipient === null) return

    if (!(await this.wanted(request.userId, request.type))) return

    const optional = canBeDisabled(request.type)
    const props = {
      displayName: recipient.displayName,
      ctaUrl: this.ctaFor(request),
      unsubscribeUrl: this.links.unsubscribe(request.userId, request.type, optional),
      settingsUrl: this.links.settings(),
    }

    await this.jobs.enqueue(
      SEND_EMAIL_JOB,
      {
        to: recipient.email,
        template: request.type,
        props: this.propsFor(request, props),
      },
      // one email per event and recipient: a redelivered domain event finds the
      // job already queued rather than sending a second copy (NOTI-1)
      { singletonKey: `noti:${request.type}:${request.userId}:${this.subjectOf(request)}` },
    )
  }

  private async wanted(userId: string, type: NotificationType): Promise<boolean> {
    // NOTI-3: the warning is sent whatever the settings say
    if (!canBeDisabled(type)) return true

    // a missing row means enabled, so nothing needs backfilling per new type
    return (await this.preferences.settingsFor(userId)).get(type) !== false
  }

  private subjectOf(request: NotificationRequest): string {
    return request.type === 'mission_ended' ? request.projectId : request.feedbackId
  }

  private ctaFor(request: NotificationRequest): string {
    return request.type === 'mission_ended'
      ? this.links.project(request.projectId)
      : this.links.feedback(request.feedbackId)
  }

  private propsFor(
    request: NotificationRequest,
    shared: {
      displayName: string
      ctaUrl: string
      unsubscribeUrl: string | null
      settingsUrl: string
    },
  ): EmailTemplateProps[NotificationType] {
    if (request.type === 'feedback_rejected') return { ...shared, reason: request.reason }
    if (request.type === 'auto_accepted') return { ...shared, role: request.role }
    if (request.type === 'mission_ended') {
      return { ...shared, ending: request.ending, refundedSlots: request.refundedSlots }
    }

    return shared
  }
}
