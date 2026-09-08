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
  /**
   * AUTH-3: what one account has written, newest first, keyed on the id rather
   * than an offset. A UUIDv7 sorts by the instant it was minted, so walking
   * `id < cursor` is walking backwards through time (ARCH-17).
   */
  listForAuthor(
    authorId: EntityId,
    options: { limit: number; before?: string },
  ): Promise<Feedback[]>
  /**
   * FDBK-9: every report a project has received, newest first. Keyed on the
   * project rather than the mission, because a project's feedback outlives the
   * mission it was written for and only the open one is on the project view.
   */
  listForProject(
    projectId: EntityId,
    options: { limit: number; before?: string },
  ): Promise<Feedback[]>
  /** FDBK-9: the report stays public, the name on it does not. */
  anonymiseAuthor(userId: EntityId): Promise<void>
  save(feedback: Feedback): Promise<void>
}
