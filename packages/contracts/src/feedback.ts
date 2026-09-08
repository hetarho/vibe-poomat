import { z } from 'zod'
import {
  cursorPageSchema,
  entityId,
  isoDate,
  REJECTION_REASONS,
  type RejectionReason,
  rejectionReasonSchema,
} from './common'

/**
 * `held`, `submitted` and `settled` all occupy a slot; `released` is the only
 * one that gives it back (FDBK-1).
 */
export const CLAIM_STATES = ['held', 'submitted', 'settled', 'released'] as const

export const claimStateSchema = z.enum(CLAIM_STATES)

export type ClaimState = z.infer<typeof claimStateSchema>

export const claimSchema = z.object({
  id: entityId,
  missionId: entityId,
  userId: entityId,
  state: claimStateSchema,
  /** When the hold runs out and the slot goes back (FDBK-1). */
  heldUntil: isoDate,
  releasedAt: isoDate.nullable(),
  createdAt: isoDate,
})

export type Claim = z.infer<typeof claimSchema>

/**
 * The caller's own claim on a mission, or none. Wrapped rather than nullable at
 * the top level so "you hold nothing" is a body somebody can read, not an empty
 * response that has to be guessed at.
 */
export const myClaimSchema = z.object({ claim: claimSchema.nullable() })

export type MyClaim = z.infer<typeof myClaimSchema>

export const FEEDBACK_STATES = ['pending', 'accepted', 'rejected'] as const

export const feedbackStateSchema = z.enum(FEEDBACK_STATES)

export type FeedbackState = z.infer<typeof feedbackStateSchema>

/** FDBK-6: a fixed list, so a rejection says something the feedbacker can read. */
export { REJECTION_REASONS, type RejectionReason, rejectionReasonSchema }

/**
 * FDBK-7's clock, in hours: the maker is warned at 48 and the report accepts
 * itself at 72. Mirrored in the api's `submit-feedback.use-case.ts`, which is
 * what actually schedules the jobs — these exist so both sides render the same
 * deadline from the same `submittedAt`.
 */
export const WARN_AFTER_HOURS = 48
export const AUTO_ACCEPT_AFTER_HOURS = 72

/** FDBK-10: enough to block an empty submission, not to measure effort. */
export const MIN_FIELD_LENGTH = 20
export const MAX_FIELD_LENGTH = 4000

const reportField = z.string().trim().min(MIN_FIELD_LENGTH).max(MAX_FIELD_LENGTH)

/** FDBK-3, all of it required. Answers are positional against the mission's questions. */
export const submitFeedbackRequestSchema = z.object({
  firstImpression: reportField,
  stuckAt: reportField,
  wouldPay: z.boolean(),
  wouldPayReason: reportField,
  suggestion: reportField,
  answers: z.array(reportField).max(3).default([]),
})

export type SubmitFeedbackRequest = z.infer<typeof submitFeedbackRequestSchema>

/** Who wrote it, or null once the account is gone (AUTH-9, FDBK-9). */
export const feedbackAuthorSchema = z
  .object({
    id: entityId,
    handle: z.string(),
    displayName: z.string(),
    avatarUrl: z.url().nullable(),
  })
  .nullable()

export const feedbackSchema = z.object({
  id: entityId,
  missionId: entityId,
  projectId: entityId,
  /**
   * The account that owns the project this was written for (FDBK-8). Public,
   * like the project's owner: it is what lets a reader tell whether the settle
   * controls and the reply box are theirs, without reading the project — which
   * PROJ-8 can refuse while FDBK-9 keeps the report itself public.
   */
  makerId: entityId,
  author: feedbackAuthorSchema,
  firstImpression: z.string(),
  stuckAt: z.string(),
  wouldPay: z.boolean(),
  wouldPayReason: z.string(),
  suggestion: z.string(),
  answers: z.array(z.string()),
  state: feedbackStateSchema,
  rejectionReason: rejectionReasonSchema.nullable(),
  rejectionNote: z.string().nullable(),
  submittedAt: isoDate,
  settledAt: isoDate.nullable(),
  /** FDBK-7: true when the 72-hour clock settled it rather than the maker. */
  automatic: z.boolean(),
})

export type Feedback = z.infer<typeof feedbackSchema>

export const rejectFeedbackRequestSchema = z.object({
  reason: rejectionReasonSchema,
  /** Optional: the reason is the fixed part, this is what the maker adds. */
  note: z.string().trim().min(1).max(1000).nullable().optional(),
})

export type RejectFeedbackRequest = z.infer<typeof rejectFeedbackRequestSchema>

export const REPLY_MIN_LENGTH = 1
export const REPLY_MAX_LENGTH = 2000

export const postReplyRequestSchema = z.object({
  body: z.string().trim().min(REPLY_MIN_LENGTH).max(REPLY_MAX_LENGTH),
})

export type PostReplyRequest = z.infer<typeof postReplyRequestSchema>

export const feedbackReplySchema = z.object({
  id: entityId,
  feedbackId: entityId,
  /** Null once the account is gone (AUTH-9), rendered as a deleted user. */
  author: feedbackAuthorSchema,
  body: z.string(),
  createdAt: isoDate,
})

export type FeedbackReply = z.infer<typeof feedbackReplySchema>

/** AUTH-3's profile list of what an account has given (ARCH-17). */
export const feedbackPageSchema = cursorPageSchema(feedbackSchema)

export type FeedbackPage = z.infer<typeof feedbackPageSchema>

export const threadPageSchema = cursorPageSchema(feedbackReplySchema)

export type ThreadPage = z.infer<typeof threadPageSchema>
