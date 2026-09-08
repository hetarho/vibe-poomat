import type { EntityId } from '../../shared/kernel'
import type { Feedback } from './feedback'

export const FEEDBACK_REPOSITORY = Symbol('FEEDBACK_REPOSITORY')

export type FeedbackRepository = {
  findById(id: EntityId): Promise<Feedback | null>
  findByClaimId(claimId: EntityId): Promise<Feedback | null>
  listForMission(missionId: EntityId): Promise<Feedback[]>
  /**
   * AUTH-9: everything still waiting on this maker's decision, including reports
   * on missions that ended long ago — closing a mission never settled them.
   */
  listPendingForMaker(makerId: EntityId): Promise<Feedback[]>
  /** FDBK-9: the report stays public, the name on it does not. */
  anonymiseAuthor(userId: EntityId): Promise<void>
  save(feedback: Feedback): Promise<void>
}
