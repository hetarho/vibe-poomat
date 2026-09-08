import type {
  JobScheduler,
  MissionReader,
  TransactionManager,
  UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ForbiddenError, ok, type Result } from '../../shared/result'
import type { ClaimRepository } from '../domain/claim.repository'
import {
  ClaimExpiredError,
  ClaimNotFoundError,
  ClaimNotHeldError,
  MissionNotOpenError,
} from '../domain/claim-errors'
import { Feedback } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { parseReport, type RawReport, type ReportFieldNotAllowedError } from '../domain/report'
import { claimJobKey, SLOT_RELEASE_JOB } from './claim-slot.use-case'
import { type FeedbackView, toFeedbackView } from './feedback-view'

/** FDBK-7: a nudge at 48 hours, and the decision made for the maker at 72. */
export const FEEDBACK_WARN_JOB = 'feedback.warn'
export const FEEDBACK_AUTO_ACCEPT_JOB = 'feedback.auto-accept'

/** FDBK-7. Mirrored as hours in `@repo/contracts`, which the web renders from. */
export const WARN_AFTER_MS = 48 * 60 * 60 * 1000
export const AUTO_ACCEPT_AFTER_MS = 72 * 60 * 60 * 1000

export type FeedbackTimerPayload = { feedbackId: string }

/** Groups a feedback's timers so rescheduling replaces rather than adds (ARCH-35). */
export function feedbackJobKey(feedbackId: string): string {
  return `feedback:${feedbackId}`
}

export type SubmitFeedbackError =
  | ReportFieldNotAllowedError
  | ClaimNotFoundError
  | ClaimNotHeldError
  | ClaimExpiredError
  | MissionNotOpenError
  | ForbiddenError

/**
 * FDBK-3 in one request: every field is checked before anything is written, the
 * slot moves from held to submitted, its release timer is cancelled and the two
 * settlement timers start.
 *
 * There is no draft and no edit — FDBK-4 makes the report a fixed artifact the
 * maker judges, so submitting is the only thing that ever writes one.
 */
export class SubmitFeedbackUseCase {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly feedbacks: FeedbackRepository,
    private readonly missions: MissionReader,
    private readonly users: UserSummaryReader,
    private readonly jobs: JobScheduler,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(input: {
    claimId: string
    actorId: string
    report: RawReport
  }): Promise<Result<FeedbackView, SubmitFeedbackError>> {
    const claimId = EntityId.parse(input.claimId)
    if (claimId.isErr()) return err(new ClaimNotFoundError('no such claim'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const claim = await this.claims.findById(claimId.value)
    if (claim === null) return err(new ClaimNotFoundError('no such claim'))
    if (!claim.isHeldBy(actorId.value)) {
      return err(new ForbiddenError('this slot is held by someone else'))
    }
    if (claim.hasLapsed()) {
      return err(new ClaimExpiredError('this hold ran out before anything was submitted'))
    }
    if (!claim.isHeld()) {
      return err(new ClaimNotHeldError('this slot is no longer held', { state: claim.state }))
    }

    const mission = await this.missions.forClaim(claim.missionId.value)
    if (mission === null) return err(new MissionNotOpenError('no such mission'))

    // the answers are positional against the questions frozen at open time
    const report = parseReport(input.report, mission.questions.length)
    if (report.isErr()) return err(report.error)

    const projectId = EntityId.parse(mission.projectId)
    const makerId = EntityId.parse(mission.ownerId)
    if (projectId.isErr() || makerId.isErr()) {
      throw new Error(`the mission reader returned an unusable id for ${mission.id}`)
    }

    return this.transactions.run(async () => {
      const submitted = claim.submit()
      if (submitted.isErr()) return err(submitted.error)

      const feedback = Feedback.submit({
        claimId: claim.id,
        missionId: claim.missionId,
        projectId: projectId.value,
        authorId: actorId.value,
        makerId: makerId.value,
        report: report.value,
      })

      await this.claims.save(claim)
      await this.feedbacks.save(feedback)

      // the slot is spoken for now, so nothing should hand it back
      await this.jobs.cancel(SLOT_RELEASE_JOB, claimJobKey(claim.id.value))

      // FDBK-7's two deadlines, at absolute instants so a restart cannot shift them
      const submittedAt = feedback.submittedAt.getTime()
      await this.jobs.schedule(
        FEEDBACK_WARN_JOB,
        { feedbackId: feedback.id.value } satisfies FeedbackTimerPayload,
        new Date(submittedAt + WARN_AFTER_MS),
        { singletonKey: feedbackJobKey(feedback.id.value) },
      )
      await this.jobs.schedule(
        FEEDBACK_AUTO_ACCEPT_JOB,
        { feedbackId: feedback.id.value } satisfies FeedbackTimerPayload,
        new Date(submittedAt + AUTO_ACCEPT_AFTER_MS),
        { singletonKey: feedbackJobKey(feedback.id.value) },
      )

      return ok(toFeedbackView(feedback, await this.users.summaryFor(actorId.value.value)))
    })
  }
}
