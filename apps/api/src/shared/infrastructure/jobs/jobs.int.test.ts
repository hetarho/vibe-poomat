import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import type PgBoss from 'pg-boss'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  JOB_SCHEDULER,
  type JobScheduler,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../application'
import { ConfigModule } from '../../config/config.module'
import { DbModule } from '../../db/db.module'
import { DB, type Db } from '../../db/db.token'
import { getDb } from '../../db/db-context'
import { EventsModule } from '../../events/events.module'
import { HealthModule } from '../../health/health.module'
import { ReadinessRegistry } from '../../health/readiness-registry'
import { deadLetterQueueFor, JOB_RETRY_LIMIT } from './job-policy'
import { JobRegistry } from './job-registry'
import { JobsModule } from './jobs.module'
import { PgBossService } from './pg-boss.service'

const JOB_NAME = 'probe.count'
const FLAKY_JOB = 'probe.flaky'

/** A real handler: idempotent because it upserts rather than increments. */
async function recordSeen(data: { key: string }): Promise<void> {
  await getDb().execute(
    sql`insert into job_probe (key, seen) values (${data.key}, 1)
        on conflict (key) do update set seen = job_probe.seen`,
  )
}

async function seenFor(db: Db, key: string): Promise<number | undefined> {
  const result = await db.execute<{ seen: number }>(
    sql`select seen from job_probe where key = ${key}`,
  )

  return result.rows[0]?.seen
}

// pg-boss polls, and a retried job waits out its backoff; a parallel turbo run
// makes both slower, so these windows are deliberately generous
async function waitFor(check: () => Promise<boolean>, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('timed out waiting for the job')
}

describe('pg-boss jobs against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let scheduler: JobScheduler
  let manager: TransactionManager
  let boss: PgBoss
  let db: Db

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule, JobsModule],
    }).compile()

    // handlers register before bootstrap, exactly as a context module would
    const registry = moduleRef.get(JobRegistry)
    registry.register({ jobName: JOB_NAME, handle: (data) => recordSeen(data as { key: string }) })
    registry.register({
      jobName: FLAKY_JOB,
      // a fast policy so the dead-letter path is provable in seconds
      retryPolicy: { retryLimit: 1, retryDelaySeconds: 0, retryBackoff: false },
      handle: async () => {
        throw new Error('this handler always fails')
      },
    })

    await moduleRef.init()
    scheduler = moduleRef.get<JobScheduler>(JOB_SCHEDULER)
    manager = moduleRef.get<TransactionManager>(TRANSACTION_MANAGER)
    boss = moduleRef.get(PgBossService).instance()
    db = moduleRef.get<Db>(DB)

    await db.execute(
      sql`create table if not exists job_probe (key text primary key, seen integer not null)`,
    )
  }, 180_000)

  afterAll(async () => {
    await db.execute(sql`drop table if exists job_probe`)
    await moduleRef.close()
  })

  it('creates its own schema, which drizzle never generated', async () => {
    const result = await db.execute<{ present: string | null }>(
      sql`select to_regclass('pgboss.job')::text as present`,
    )

    expect(result.rows[0]?.present).toBe('pgboss.job')
  })

  it('reports jobs as ready', async () => {
    const report = await moduleRef.get(ReadinessRegistry).report()

    expect(report.checks.jobs).toBe(true)
  })

  it('leaves no job behind when the transaction rolls back', async () => {
    await expect(
      manager.run(async () => {
        await scheduler.enqueue(JOB_NAME, { key: 'rolled-back' })
        throw new Error('the use case failed after scheduling')
      }),
    ).rejects.toThrow('the use case failed after scheduling')

    const result = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pgboss.job where name = ${JOB_NAME} and data->>'key' = 'rolled-back'`,
    )
    expect(result.rows[0]?.count).toBe('0')
  })

  it('runs a job enqueued in a committed transaction exactly once', async () => {
    await manager.run(async () => {
      await scheduler.enqueue(JOB_NAME, { key: 'committed' })
    })

    await waitFor(async () => (await seenFor(db, 'committed')) !== undefined)

    expect(await seenFor(db, 'committed')).toBe(1)
  })

  it('reaches the same end state when the same payload is handled twice', async () => {
    await recordSeen({ key: 'idempotent' })
    const afterFirst = await seenFor(db, 'idempotent')
    await recordSeen({ key: 'idempotent' })

    expect(await seenFor(db, 'idempotent')).toBe(afterFirst)
  })

  it('cancels a scheduled job by its singleton key', async () => {
    const runAt = new Date(Date.now() + 60_000)
    await manager.run(async () => {
      await scheduler.schedule(JOB_NAME, { key: 'cancelled' }, runAt, { singletonKey: 'probe:c' })
    })

    await scheduler.cancel(JOB_NAME, 'probe:c')

    const result = await db.execute<{ state: string }>(
      sql`select state from pgboss.job where name = ${JOB_NAME} and singleton_key = 'probe:c'`,
    )
    expect(result.rows[0]?.state).toBe('cancelled')
  })

  it('applies the default policy to a queue that asks for nothing special', async () => {
    const result = await db.execute<{ retry_limit: number; dead_letter: string | null }>(
      sql`select retry_limit, dead_letter from pgboss.queue where name = ${JOB_NAME}`,
    )

    expect(result.rows[0]?.retry_limit).toBe(JOB_RETRY_LIMIT)
    expect(result.rows[0]?.dead_letter).toBe(deadLetterQueueFor(JOB_NAME))
  })

  it('gives up after its retries and dead-letters instead of retrying forever', async () => {
    await manager.run(async () => {
      await scheduler.enqueue(FLAKY_JOB, { key: 'always-fails' })
    })

    await waitFor(async () => {
      const result = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from pgboss.job where name = ${deadLetterQueueFor(FLAKY_JOB)}`,
      )

      return result.rows[0]?.count !== '0'
    }, 90_000)

    const attempts = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from pgboss.job where name = ${FLAKY_JOB} and state = 'failed'`,
    )
    expect(Number(attempts.rows[0]?.count)).toBeGreaterThan(0)
  }, 60_000)
})
