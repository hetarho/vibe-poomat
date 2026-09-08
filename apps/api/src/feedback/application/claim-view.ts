import type { ClaimState, FeedbackClaim } from '../domain/feedback-claim'

export type ClaimView = {
  id: string
  missionId: string
  userId: string
  state: ClaimState
  heldUntil: Date
  releasedAt: Date | null
  createdAt: Date
}

export function toClaimView(claim: FeedbackClaim): ClaimView {
  return {
    id: claim.id.value,
    missionId: claim.missionId.value,
    userId: claim.userId.value,
    state: claim.state,
    heldUntil: claim.heldUntil,
    releasedAt: claim.releasedAt,
    createdAt: claim.createdAt,
  }
}
