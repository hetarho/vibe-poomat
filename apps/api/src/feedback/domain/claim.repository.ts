import type { SlotOccupancy } from '../../shared/application'
import type { EntityId } from '../../shared/kernel'
import type { FeedbackClaim } from './feedback-claim'

export const CLAIM_REPOSITORY = Symbol('CLAIM_REPOSITORY')

export type ClaimRepository = {
  findById(id: EntityId): Promise<FeedbackClaim | null>
  /** The caller's live claim on this mission, which FDBK-2 allows at most one of. */
  findLiveFor(missionId: EntityId, userId: EntityId): Promise<FeedbackClaim | null>
  /**
   * Locks the mission's claims for the rest of the transaction, so two people
   * cannot both see the last slot as free. Returns what is spoken for now.
   */
  lockOccupancy(missionId: EntityId): Promise<SlotOccupancy>
  occupancyFor(missionId: string): Promise<SlotOccupancy>
  occupancyForMany(missionIds: readonly string[]): Promise<Map<string, SlotOccupancy>>
  /** AUTH-9: every slot this account is still sitting on, so it can hand them back. */
  listHeldBy(userId: EntityId): Promise<FeedbackClaim[]>
  save(claim: FeedbackClaim): Promise<void>
}
