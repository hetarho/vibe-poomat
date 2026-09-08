import { Inject, Injectable } from '@nestjs/common'
import type { FeedbackPurge, JobScheduler } from '../../shared/application'
import { JOB_SCHEDULER } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ok, type Result } from '../../shared/result'
import { claimJobKey, SLOT_RELEASE_JOB } from '../application/claim-slot.use-case'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import { CLAIM_REPOSITORY, type ClaimRepository } from '../domain/claim.repository'
import { FEEDBACK_REPOSITORY, type FeedbackRepository } from '../domain/feedback.repository'
import { REPLY_REPOSITORY, type ReplyRepository } from '../domain/reply.repository'

/**
 * What AUTH-9 may ask of the `feedback` context. The three calls are separate
 * because they happen at three different points of the sequence: the holds go
 * back first so other people can use those slots, the pending reports are
 * settled before anything is voided, and the anonymisation happens last —
 * FDBK-9 keeps what the account gave to other people.
 */
@Injectable()
export class FeedbackAccountPurge implements FeedbackPurge {
  constructor(
    @Inject(CLAIM_REPOSITORY) private readonly claims: ClaimRepository,
    @Inject(FEEDBACK_REPOSITORY) private readonly feedbacks: FeedbackRepository,
    @Inject(REPLY_REPOSITORY) private readonly replies: ReplyRepository,
    @Inject(JOB_SCHEDULER) private readonly jobs: JobScheduler,
    private readonly settlement: SettleFeedbackUseCase,
  ) {}

  async releaseHoldsOf(userId: string): Promise<Result<void, DomainError>> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return err(id.error)

    for (const claim of await this.claims.listHeldBy(id.value)) {
      const released = claim.release({ expired: false })
      if (released.isErr()) return err(released.error)

      await this.claims.save(claim)
      // the slot is back in the pool now, so nothing should release it again
      await this.jobs.cancel(SLOT_RELEASE_JOB, claimJobKey(claim.id.value))
    }

    return ok(undefined)
  }

  /**
   * CRED-4 through the ordinary auto-accept path, not a shortcut: the credit
   * movement a feedbacker gets when an account is deleted has to be provably the
   * same one they would have got at the 72-hour mark.
   */
  async settlePendingFor(makerId: string): Promise<Result<number, DomainError>> {
    const id = EntityId.parse(makerId)
    if (id.isErr()) return err(id.error)

    const pending = await this.feedbacks.listPendingForMaker(id.value)
    for (const feedback of pending) {
      const settled = await this.settlement.autoAccept(feedback.id.value)
      if (settled.isErr()) return err(settled.error)
    }

    return ok(pending.length)
  }

  async anonymise(userId: string): Promise<Result<void, DomainError>> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return err(id.error)

    await this.feedbacks.anonymiseAuthor(id.value)
    await this.replies.anonymiseAuthor(id.value)

    return ok(undefined)
  }
}
