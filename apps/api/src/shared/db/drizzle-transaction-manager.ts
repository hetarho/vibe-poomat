import type { EventBus, TransactionManager } from '../application'
import type { DomainEvent } from '../kernel'
import type { Db } from './db.token'
import { transactionScope } from './transaction-scope'

export class DrizzleTransactionManager implements TransactionManager {
  constructor(
    private readonly db: Db,
    private readonly eventBus: EventBus,
  ) {}

  async run<T>(work: () => Promise<T>): Promise<T> {
    // a nested run joins the outer transaction rather than opening a second one
    if (transactionScope.getStore() !== undefined) return work()

    const events: DomainEvent[] = []
    const result = await this.db.transaction(async (tx) =>
      transactionScope.run({ tx: tx as unknown as Db, events }, work),
    )

    // outside the scope on purpose: a handler must not find an ambient
    // transaction, because the one that produced these events is finished
    await this.eventBus.publish(events)

    return result
  }
}
