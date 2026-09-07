import type { DomainEventCollector } from '../application'
import type { DomainEvent } from '../kernel'
import { transactionScope } from './transaction-scope'

/**
 * Collects into the ambient transaction, so a rollback discards the events with
 * the writes that produced them. Outside a transaction there is nothing to
 * commit and therefore nothing to dispatch.
 */
export class ScopedDomainEventCollector implements DomainEventCollector {
  collect(events: readonly DomainEvent[]): void {
    const scope = transactionScope.getStore()
    if (scope === undefined) return

    scope.events.push(...events)
  }
}
