import type { EntityId } from '../../shared/kernel'
import type { Feedback } from './feedback'

export const FEEDBACK_REPOSITORY = Symbol('FEEDBACK_REPOSITORY')

export type FeedbackRepository = {
  findById(id: EntityId): Promise<Feedback | null>
  findByClaimId(claimId: EntityId): Promise<Feedback | null>
  listForMission(missionId: EntityId): Promise<Feedback[]>
  save(feedback: Feedback): Promise<void>
}
