import type { RejectionReason } from './rejection-reasons'

/**
 * Names of the domain events that cross a context boundary. They live in the
 * kernel because both ends need them and neither may import the other: a
 * subscriber in one context would otherwise have to reach into the aggregate of
 * another just to learn a string (ARCH-10).
 *
 * An event nobody outside its own context listens to keeps its name at home.
 */
export const CROSS_CONTEXT_EVENTS = {
  /** Signup happened (AUTH-2). The aggregate id is the account id. */
  accountCreated: 'auth.account-created',
  /** A mission stopped taking feedback (PROJ-6). The aggregate id is the mission. */
  missionEnded: 'project.mission-ended',
  /** Somebody took a slot (FDBK-1). The aggregate id is the claim. */
  claimHeld: 'feedback.claim-held',
  /** A slot went back, by hand or because the day ran out (FDBK-1). */
  claimReleased: 'feedback.claim-released',
  /** A report landed and is waiting on the maker (FDBK-3). */
  feedbackSubmitted: 'feedback.submitted',
  /** The maker has not answered in 48 hours and has 24 left (FDBK-7). */
  autoAcceptWarning: 'feedback.auto-accept-warning',
  /** One side of a thread said something to the other (FDBK-5). */
  threadReplied: 'feedback.thread-replied',
  /** One slot's credit moved (CRED-4). The aggregate id is the feedback. */
  slotSettled: 'feedback.slot-settled',
} as const

/**
 * What a subscriber may rely on, whatever else the emitting aggregate carries.
 * Declared here for the same reason the names are: every consumer of these lives
 * in another context from the aggregate that raised them, and the notification
 * context (NOTI-2) consumes all of them.
 *
 * The emitting classes `implements` these, so an aggregate that stops carrying a
 * published field stops compiling rather than quietly sending nobody an email.
 */
export type SlotSettledPayload = { readonly missionId: string }

/** FDBK-3: a report landed. The aggregate id is the feedback. */
export type SubmissionAnnouncement = {
  readonly missionId: string
  readonly projectId: string
  readonly makerId: string
  readonly feedbackerId: string
}

/** CRED-4: one slot's credit moved. The aggregate id is the feedback. */
export type SettlementAnnouncement = SubmissionAnnouncement & {
  readonly outcome: 'accepted' | 'rejected'
  /** FDBK-7: true when the 72-hour clock decided rather than the maker. */
  readonly automatic: boolean
  readonly rejectionReason: RejectionReason | null
}

/** FDBK-5: one side of a thread spoke. The aggregate id is the reply. */
export type ThreadReplyAnnouncement = {
  readonly feedbackId: string
  readonly authorId: string
  readonly recipientId: string
}

/** FDBK-7: 24 hours left. The aggregate id is the feedback. */
export type WarningAnnouncement = {
  readonly missionId: string
  readonly makerId: string
}

/** PROJ-6: a mission stopped taking feedback. The aggregate id is the mission. */
export type MissionEndAnnouncement = {
  readonly projectId: string
  readonly state: string
  readonly refundedSlots: number
}

function fieldsOf(event: object): Record<string, unknown> {
  return event as Record<string, unknown>
}

function hasStrings(event: object, keys: readonly string[]): boolean {
  const record = fieldsOf(event)

  return keys.every((key) => typeof record[key] === 'string')
}

export function carriesMissionId<TEvent extends object>(
  event: TEvent,
): event is TEvent & SlotSettledPayload {
  return 'missionId' in event && typeof (event as { missionId: unknown }).missionId === 'string'
}

export function announcesSubmission<TEvent extends object>(
  event: TEvent,
): event is TEvent & SubmissionAnnouncement {
  return hasStrings(event, ['missionId', 'projectId', 'makerId', 'feedbackerId'])
}

export function announcesSettlement<TEvent extends object>(
  event: TEvent,
): event is TEvent & SettlementAnnouncement {
  return (
    announcesSubmission(event) &&
    hasStrings(event, ['outcome']) &&
    typeof fieldsOf(event).automatic === 'boolean'
  )
}

export function announcesThreadReply<TEvent extends object>(
  event: TEvent,
): event is TEvent & ThreadReplyAnnouncement {
  return hasStrings(event, ['feedbackId', 'authorId', 'recipientId'])
}

export function announcesWarning<TEvent extends object>(
  event: TEvent,
): event is TEvent & WarningAnnouncement {
  return hasStrings(event, ['missionId', 'makerId'])
}

export function announcesMissionEnd<TEvent extends object>(
  event: TEvent,
): event is TEvent & MissionEndAnnouncement {
  return (
    hasStrings(event, ['projectId', 'state']) && typeof fieldsOf(event).refundedSlots === 'number'
  )
}
