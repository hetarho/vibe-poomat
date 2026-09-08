import type {
  CreditOperations,
  JobScheduler,
  MissionReader,
  TransactionManager,
  UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ForbiddenError, ok, type Result } from '../../shared/result'
import type { ClaimRepository } from '../domain/claim.repository'
import {
  ClaimNotFoundError,
  FeedbackNotFoundError,
  FeedbackNotPendingError,
  MissionNotOpenError,
} from '../domain/claim-errors'
import type { Feedback, RejectionReason } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { type FeedbackView, toFeedbackView } from './feedback-view'
import {
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  feedbackJobKey,
} from './submit-feedback.use-case'

export type SettleFeedbackError =
  | FeedbackNotFoundError
  | FeedbackNotPendingError
  | ClaimNotFoundError
  | MissionNotOpenError
  | ForbiddenError
  | DomainError

/**
 * FDBK-6 and FDBK-7. The maker's decision and the clock's decision run through
 * exactly the same code — `automatic` only changes what is announced, never what
 * moves — because the credit movement has to be provably identical.
 *
 * The report, the slot, the credit and the mission's own state all move in one
 * transaction (ARCH-38), and the notification effects are events recorded on the
 * aggregate, which reach handlers only after it commits (ARCH-39).
 */
export class SettleFeedbackUseCase {
  constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly claims: ClaimRepository,
    private readonly missions: MissionReader,
    private readonly credits: CreditOperations,
    private readonly users: UserSummaryReader,
    private readonly jobs: JobScheduler,
    private readonly transactions: TransactionManager,
  ) {}

  /** FDBK-6: the maker says yes; the credit goes to whoever did the work. */
  async accept(input: {
    feedbackId: string
    actorId: string
  }): Promise<Result<FeedbackView, SettleFeedbackError>> {
    return this.settle({ feedbackId: input.feedbackId, actorId: input.actorId, decision: 'accept' })
  }

  /** FDBK-6: a fixed reason the feedbacker can read, and the credit comes back. */
  async reject(input: {
    feedbackId: string
    actorId: string
    reason: RejectionReason
    note?: string | null
  }): Promise<Result<FeedbackView, SettleFeedbackError>> {
    return this.settle({
      feedbackId: input.feedbackId,
      actorId: input.actorId,
      decision: 'reject',
      reason: input.reason,
      note: input.note ?? null,
    })
  }

  /**
   * FDBK-7's 72-hour deadline. Reuses the accept path with no actor rather than
   * a parallel one, so there is no second place a credit movement could differ.
   * A report somebody already settled is left exactly as it is.
   */
  async autoAccept(feedbackId: string): Promise<Result<void, SettleFeedbackError>> {
    const settled = await this.settle({ feedbackId, actorId: null, decision: 'accept' })
    // a report somebody already settled is not a failure worth retrying
    if (settled.isErr() && settled.error.code === 'FEEDBACK_ALREADY_SETTLED') return ok(undefined)
    if (settled.isErr()) return err(settled.error)

    return ok(undefined)
  }

  /** FDBK-7's nudge at 48 hours, and only while there is still a decision to make. */
  async warn(feedbackId: string): Promise<Result<void, SettleFeedbackError>> {
    const loaded = await this.load(feedbackId)
    if (loaded.isErr()) return err(loaded.error)

    const { feedback, mission } = loaded.value
    if (!feedback.isPending()) return ok(undefined)

    return this.transactions.run(async () => {
      feedback.warnMaker({ missionId: mission.id, makerId: mission.ownerId })
      await this.feedbacks.save(feedback)

      return ok(undefined)
    })
  }

  private async settle(input: {
    feedbackId: string
    /** Null when the clock decided rather than a person (FDBK-7). */
    actorId: string | null
    decision: 'accept' | 'reject'
    reason?: RejectionReason
    note?: string | null
  }): Promise<Result<FeedbackView, SettleFeedbackError>> {
    const loaded = await this.load(input.feedbackId)
    if (loaded.isErr()) return err(loaded.error)

    const { feedback, mission } = loaded.value

    // only the maker decides, and only while there is a decision to make
    if (input.actorId !== null && input.actorId !== mission.ownerId) {
      return err(new ForbiddenError('this feedback is on somebody else’s project'))
    }
    if (!feedback.isPending()) {
      return err(
        new FeedbackNotPendingError('this feedback has already been settled', {
          state: feedback.state,
        }),
      )
    }

    const claim = await this.claims.findById(feedback.claimId)
    if (claim === null) return err(new ClaimNotFoundError('no such claim'))

    const feedbackerId = feedback.authorId?.value ?? claim.userId.value

    return this.transactions.run(async () => {
      const automatic = input.actorId === null
      const moved =
        input.decision === 'accept'
          ? feedback.accept({ missionId: mission.id, makerId: mission.ownerId, automatic })
          : feedback.reject({
              reason: input.reason as RejectionReason,
              note: input.note ?? null,
              missionId: mission.id,
              makerId: mission.ownerId,
            })
      if (moved.isErr()) return err(moved.error)

      // CRED-4, one credit either way: to the feedbacker when the work stood, back
      // to the maker when it did not. The ledger's own key makes a duplicated job
      // a no-op even if everything above somehow ran twice
      const settledCredit = await this.credits.settleSlot({
        feedbackId: feedback.id.value,
        to: input.decision === 'accept' ? 'feedbacker' : 'maker',
        makerId: mission.ownerId,
        feedbackerId,
      })
      if (settledCredit.isErr()) return err(settledCredit.error)

      // the slot is spent rather than freed: it never goes back into the pool
      const spent = claim.settle()
      if (spent.isErr()) return err(spent.error)

      await this.claims.save(claim)
      await this.feedbacks.save(feedback)

      // nothing left for either deadline to do
      await this.jobs.cancel(FEEDBACK_WARN_JOB, feedbackJobKey(feedback.id.value))
      await this.jobs.cancel(FEEDBACK_AUTO_ACCEPT_JOB, feedbackJobKey(feedback.id.value))

      return ok(toFeedbackView(feedback, await this.authorOf(feedback)))
    })
  }

  private async load(
    feedbackId: string,
  ): Promise<
    Result<{ feedback: Feedback; mission: { id: string; ownerId: string } }, SettleFeedbackError>
  > {
    const id = EntityId.parse(feedbackId)
    if (id.isErr()) return err(new FeedbackNotFoundError('no such feedback'))

    const feedback = await this.feedbacks.findById(id.value)
    if (feedback === null) return err(new FeedbackNotFoundError('no such feedback'))

    const mission = await this.missions.forClaim(feedback.missionId.value)
    if (mission === null) return err(new MissionNotOpenError('no such mission'))

    return ok({ feedback, mission: { id: mission.id, ownerId: mission.ownerId } })
  }

  private async authorOf(feedback: Feedback) {
    if (feedback.authorId === null) return null

    return this.users.summaryFor(feedback.authorId.value)
  }
}
