import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { JobHandler } from '../../shared/application'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import {
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  type FeedbackTimerPayload,
} from '../application/submit-feedback.use-case'

/**
 * FDBK-7's nudge, 24 hours before the decision is made for the maker. It only
 * fires while there is still a decision to make; a report already settled leaves
 * the handler with nothing to say.
 */
@Injectable()
export class WarnMakerJob implements JobHandler<FeedbackTimerPayload>, OnModuleInit {
  readonly jobName = FEEDBACK_WARN_JOB
  private readonly logger = new Logger(WarnMakerJob.name)

  constructor(
    private readonly settlement: SettleFeedbackUseCase,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: FeedbackTimerPayload): Promise<void> {
    const warned = await this.settlement.warn(data.feedbackId)
    if (warned.isErr()) {
      // a report that has gone is not worth retrying; anything else is
      if (warned.error.code === 'FEEDBACK_NOT_FOUND') return

      this.logger.error(`could not warn about ${data.feedbackId}: ${warned.error.message}`)
      throw new Error(warned.error.message)
    }
  }
}

/**
 * FDBK-7's deadline: 72 hours with no answer settles the report as an accept,
 * because a maker who says nothing must not cost a feedbacker their credit.
 *
 * Idempotent twice over — the state check inside the transaction, and the credit
 * ledger's own `(type, account, ref)` key — so a redelivered job pays once.
 */
@Injectable()
export class AutoAcceptFeedbackJob implements JobHandler<FeedbackTimerPayload>, OnModuleInit {
  readonly jobName = FEEDBACK_AUTO_ACCEPT_JOB
  private readonly logger = new Logger(AutoAcceptFeedbackJob.name)

  constructor(
    private readonly settlement: SettleFeedbackUseCase,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: FeedbackTimerPayload): Promise<void> {
    const settled = await this.settlement.autoAccept(data.feedbackId)
    if (settled.isErr()) {
      if (settled.error.code === 'FEEDBACK_NOT_FOUND') return

      this.logger.error(`could not auto-accept ${data.feedbackId}: ${settled.error.message}`)
      throw new Error(settled.error.message)
    }
  }
}
