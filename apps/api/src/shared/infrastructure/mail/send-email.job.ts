import { Inject, Injectable, type OnModuleInit } from '@nestjs/common'
import { type JobHandler, MAILER, type Mailer, type MailRequest } from '../../application'
import { JobRegistry } from '../jobs/job-registry'

export const SEND_EMAIL_JOB = 'email.send'

/**
 * Every send goes through this job (ARCH-36): a mail outage must never fail the
 * use case that wanted to notify someone. Idempotent in the sense pg-boss needs:
 * re-running it sends the same message again only if the job itself is redelivered,
 * which is why callers enqueue one job per event (NOTI-1).
 */
@Injectable()
export class SendEmailJob implements JobHandler<MailRequest>, OnModuleInit {
  readonly jobName = SEND_EMAIL_JOB

  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: MailRequest): Promise<void> {
    await this.mailer.send(data)
  }
}
