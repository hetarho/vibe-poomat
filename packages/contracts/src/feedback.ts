import { z } from 'zod'
import { entityId, isoDate } from './common'

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

export const FEEDBACK_STATES = ['pending', 'accepted', 'rejected'] as const

export const feedbackStateSchema = z.enum(FEEDBACK_STATES)

export type FeedbackState = z.infer<typeof feedbackStateSchema>

/** FDBK-6: a fixed list, so a rejection says something the feedbacker can read. */
export const REJECTION_REASONS = ['task-not-done', 'no-substance', 'spam-abuse'] as const

export const rejectionReasonSchema = z.enum(REJECTION_REASONS)

export type RejectionReason = z.infer<typeof rejectionReasonSchema>

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
})

export type Feedback = z.infer<typeof feedbackSchema>
