import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { JobHandler } from '../../shared/application'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import {
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  type FeedbackTimerPayload,
} from '../application/submit-feedback.use-case'

/**
 * FDBK-7's two deadlines exist from the moment a report is submitted, so their
 * queues have to exist too — a job cannot be scheduled under a name nothing has
 * registered. T027 gives these bodies. Until then they say out loud what would
 * have happened, rather than dropping a deadline in silence.
 *
 * Written as two plain classes rather than one base and two subclasses, because
 * a subclass with no constructor of its own emits no parameter metadata and
 * NestJS would have nothing to inject.
 */
@Injectable()
export class WarnMakerJob implements JobHandler<FeedbackTimerPayload>, OnModuleInit {
  readonly jobName = FEEDBACK_WARN_JOB
  private readonly logger = new Logger(WarnMakerJob.name)

  constructor(private readonly registry: JobRegistry) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: FeedbackTimerPayload): Promise<void> {
    this.logger.warn(`the 48-hour warning for ${data.feedbackId} is due; T027 sends it`)
  }
}

@Injectable()
export class AutoAcceptFeedbackJob implements JobHandler<FeedbackTimerPayload>, OnModuleInit {
  readonly jobName = FEEDBACK_AUTO_ACCEPT_JOB
  private readonly logger = new Logger(AutoAcceptFeedbackJob.name)

  constructor(private readonly registry: JobRegistry) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: FeedbackTimerPayload): Promise<void> {
    this.logger.warn(`the 72-hour auto-accept for ${data.feedbackId} is due; T027 settles it`)
  }
}
