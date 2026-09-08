import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool, PoolClient } from 'pg'
import type { EventBus, TransactionManager } from '../application'
import type { DomainEvent } from '../kernel'
import type { Db } from './db.token'
import { transactionScope } from './transaction-scope'

/**
 * A use case reports an expected failure by returning `err(...)` rather than by
 * throwing (ARCH-12), so "the work returned" is not the same as "the work
 * succeeded". Committing the writes that happened before such a failure would
 * leave exactly the half-applied state ARCH-38 exists to prevent — an account
 * with no identity, a profile edit with no avatar — so an errored Result rolls
 * back like a thrown error does.
 */
function isFailedResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as { isErr?: unknown }

  return typeof candidate.isErr === 'function' && (candidate as { isErr(): boolean }).isErr()
}

/**
 * Drives BEGIN/COMMIT on one checked-out connection rather than going through
 * Drizzle's `db.transaction()`, because the scope has to expose that same
 * connection as raw pg: it is how pg-boss enqueues a job inside the very
 * transaction that decided to schedule it (ARCH-35, ARCH-38).
 */
export class DrizzleTransactionManager implements TransactionManager {
  constructor(
    private readonly pool: Pool,
    private readonly eventBus: EventBus,
    private readonly toDb: (client: PoolClient) => Db = (client) => drizzle(client),
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    // a nested run joins the outer transaction rather than opening a second one,
    // and leaves the commit-or-rollback decision to the outermost one
    if (transactionScope.getStore() !== undefined) return work()

    const client = await this.pool.connect()
    const events: DomainEvent[] = []
    let result: T
    let failed = false

    try {
      await client.query('begin')
      result = await transactionScope.run({ tx: this.toDb(client), client, events }, work)
      failed = isFailedResult(result)
      await client.query(failed ? 'rollback' : 'commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    // nothing committed, so nothing happened: publishing here would announce a
    // write that was rolled back (ARCH-39)
    if (failed) return result

    // outside the scope on purpose: a handler must not find an ambient
    // transaction, because the one that produced these events is finished
    await this.eventBus.publish(events)

    return result
  }
}
