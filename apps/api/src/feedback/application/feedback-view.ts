import type { UserSummary } from '../../shared/application'
import type { Feedback, FeedbackState, RejectionReason } from '../domain/feedback'

/** FDBK-9: an author who has gone still leaves the report readable. */
export const DELETED_AUTHOR = null

export type FeedbackView = {
  id: string
  missionId: string
  projectId: string
  /** Null once the account is gone (AUTH-9), which the web layer renders as a deleted user. */
  author: UserSummary | null
  firstImpression: string
  stuckAt: string
  wouldPay: boolean
  wouldPayReason: string
  suggestion: string
  answers: readonly string[]
  state: FeedbackState
  rejectionReason: RejectionReason | null
  rejectionNote: string | null
  submittedAt: Date
  settledAt: Date | null
}

export function toFeedbackView(
  feedback: Feedback,
  author: UserSummary | null = null,
): FeedbackView {
  return {
    id: feedback.id.value,
    missionId: feedback.missionId.value,
    projectId: feedback.projectId.value,
    author,
    firstImpression: feedback.report.firstImpression.value,
    stuckAt: feedback.report.stuckAt.value,
    wouldPay: feedback.report.wouldPay,
    wouldPayReason: feedback.report.wouldPayReason.value,
    suggestion: feedback.report.suggestion.value,
    answers: feedback.report.answers.map((answer) => answer.value),
    state: feedback.state,
    rejectionReason: feedback.rejectionReason,
    rejectionNote: feedback.rejectionNote,
    submittedAt: feedback.submittedAt,
    settledAt: feedback.settledAt,
  }
}
