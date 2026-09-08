import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  JOB_SCHEDULER,
  type JobScheduler,
  MAILER,
  type Mailer,
  type MailRequest,
  PermanentJobFailure,
  SEND_EMAIL_JOB,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../application'
import { ConfigModule } from '../../config/config.module'
import { DbModule } from '../../db/db.module'
import { DB, type Db } from '../../db/db.token'
import { EventsModule } from '../../events/events.module'
import { HealthModule } from '../../health/health.module'
import { deadLetterQueueFor } from '../jobs/job-policy'
import { JobsModule } from '../jobs/jobs.module'
import { MailModule } from './mail.module'

const REQUEST: MailRequest = {
  to: 'someone@example.test',
  template: 'account-welcome',
  props: { displayName: 'Haeram', ctaUrl: 'https://vibe-poomat.test/feed' },
}

/** Records every send and can be told to fail the next one. */
class RecordingMailer implements Mailer {
  readonly sent: MailRequest[] = []
  nextFailure: Error | undefined

  async send(request: MailRequest): Promise<void> {
    const failure = this.nextFailure
    if (failure !== undefined) {
      this.nextFailure = undefined
      throw failure
    }
    this.sent.push(request)
  }
}

// pg-boss polls, and a retried job waits out its backoff; a parallel turbo run
// makes both slower, so these windows are deliberately generous
async function waitFor(check: () => Promise<boolean>, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('timed out waiting for the email job')
}

describe('email.send against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let scheduler: JobScheduler
  let manager: TransactionManager
  let mailer: RecordingMailer
  let db: Db

  beforeAll(async () => {
    mailer = new RecordingMailer()
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule, JobsModule, MailModule],
    })
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile()

    await moduleRef.init()
    scheduler = moduleRef.get<JobScheduler>(JOB_SCHEDULER)
    manager = moduleRef.get<TransactionManager>(TRANSACTION_MANAGER)
    db = moduleRef.get<Db>(DB)
  }, 180_000)

  afterAll(async () => {
    await moduleRef.close()
  })

  it('sends once for one enqueued job', async () => {
    await manager.run(async () => {
      await scheduler.enqueue(SEND_EMAIL_JOB, { ...REQUEST })
    })

    await waitFor(async () => mailer.sent.length > 0)

    expect(mailer.sent).toHaveLength(1)
    expect(mailer.sent[0]).toMatchObject({ to: REQUEST.to, template: 'account-welcome' })
  })

  it('retries a transient failure and eventually sends', async () => {
    mailer.sent.length = 0
    mailer.nextFailure = new Error('resend is briefly unavailable')

    await manager.run(async () => {
      await scheduler.enqueue(SEND_EMAIL_JOB, { ...REQUEST, to: 'retried@example.test' })
    })

    await waitFor(async () => mailer.sent.some((sent) => sent.to === 'retried@example.test'))

    expect(mailer.sent.filter((sent) => sent.to === 'retried@example.test')).toHaveLength(1)
  }, 90_000)

  it('dead-letters a rejected address instead of retrying it', async () => {
    mailer.sent.length = 0
    mailer.nextFailure = new PermanentJobFailure('resend rejected the message with 422')

    await manager.run(async () => {
      await scheduler.enqueue(SEND_EMAIL_JOB, { ...REQUEST, to: 'bad-address' })
    })

    await waitFor(async () => {
      const result = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from pgboss.job where name = ${deadLetterQueueFor(SEND_EMAIL_JOB)}`,
      )

      return result.rows[0]?.count !== '0'
    })

    expect(mailer.sent.filter((sent) => sent.to === 'bad-address')).toHaveLength(0)
  })

  it('leaves no email job behind when the use case rolls back', async () => {
    await expect(
      manager.run(async () => {
        await scheduler.enqueue(SEND_EMAIL_JOB, { ...REQUEST, to: 'never-sent@example.test' })
        throw new Error('the use case failed after scheduling the email')
      }),
    ).rejects.toThrow('the use case failed')

    const result = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pgboss.job
          where name = ${SEND_EMAIL_JOB} and data->>'to' = 'never-sent@example.test'`,
    )
    expect(result.rows[0]?.count).toBe('0')
  })
})
