import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool, PoolClient } from 'pg'
import type { EventBus, TransactionManager } from '../application'
import type { DomainEvent } from '../kernel'
import type { Db } from './db.token'
import { transactionScope } from './transaction-scope'

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
    // a nested run joins the outer transaction rather than opening a second one
    if (transactionScope.getStore() !== undefined) return work()

    const client = await this.pool.connect()
    const events: DomainEvent[] = []
    let result: T

    try {
      await client.query('begin')
      result = await transactionScope.run({ tx: this.toDb(client), client, events }, work)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }

    // outside the scope on purpose: a handler must not find an ambient
    // transaction, because the one that produced these events is finished
    await this.eventBus.publish(events)

    return result
  }
}
