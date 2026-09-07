import { Injectable } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import type { JobOptions, JobScheduler } from '../../application'
import { currentTransactionClient } from '../../db/transaction-scope'
import { JobRegistry } from './job-registry'

/** pg-boss states a job can still be stopped in. */
const CANCELLABLE_STATES = ['created', 'retry']

@Injectable()
export class PgBossJobScheduler implements JobScheduler {
  constructor(
    private readonly boss: PgBoss,
    private readonly registry: JobRegistry,
  ) {}

  async enqueue(name: string, data: object, options?: JobOptions): Promise<void> {
    await this.boss.send(name, data, this.sendOptions(name, options))
  }

  async schedule(name: string, data: object, runAt: Date, options?: JobOptions): Promise<void> {
    // absolute time, never a delay computed later: clocks drift across restarts
    await this.boss.send(name, data, { ...this.sendOptions(name, options), startAfter: runAt })
  }

  async cancel(name: string, singletonKey: string): Promise<void> {
    const connection = this.connection()
    const ids = await this.pendingJobIds(name, singletonKey)
    if (ids.length === 0) return

    // best effort by design: a handler still re-checks state when it runs
    await this.boss.cancel(name, ids, connection)
  }

  /**
   * pg-boss 11 has no lookup by singleton key, so this reads its own job table
   * directly. The read is the only coupling; the state change still goes through
   * pg-boss so its bookkeeping stays correct.
   */
  private async pendingJobIds(name: string, singletonKey: string): Promise<string[]> {
    const executor = this.executor()
    const { rows } = await executor.executeSql(
      `select id from pgboss.job
        where name = $1 and singleton_key = $2 and state::text = any($3::text[])`,
      [name, singletonKey, CANCELLABLE_STATES],
    )

    return rows.map((row: { id: string }) => row.id)
  }

  /**
   * Runs through the ambient transaction when there is one, so a rolled-back use
   * case leaves no job behind (ARCH-35, ARCH-38).
   */
  private connection(): PgBoss.ConnectionOptions {
    const client = currentTransactionClient()
    if (client === undefined) return {}

    return {
      db: {
        executeSql: async (text: string, values: unknown[]) => client.query(text, values),
      },
    }
  }

  private executor(): PgBoss.Db {
    const { db } = this.connection()
    if (db !== undefined) return db

    return {
      executeSql: async (text: string, values: unknown[]) =>
        this.boss.getDb().executeSql(text, values),
    }
  }

  private sendOptions(name: string, options?: JobOptions): PgBoss.SendOptions {
    // an unregistered name fails here, at the call site, not when a worker looks
    this.registry.require(name)

    // the retry and dead-letter policy belongs to the queue, set once at boot,
    // so every send of a job name inherits the same one
    return {
      ...this.connection(),
      ...(options?.singletonKey === undefined ? {} : { singletonKey: options.singletonKey }),
    }
  }
}
