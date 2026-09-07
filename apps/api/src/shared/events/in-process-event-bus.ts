import { Injectable, Logger } from '@nestjs/common'
import type { EventBus } from '../application'
import { hasAmbientTransaction } from '../db/transaction-scope'
import type { DomainEvent } from '../kernel'
import { DomainEventRegistry } from './domain-event-registry'

export const IN_TRANSACTION_DISPATCH_MESSAGE =
  'domain events must be dispatched after the transaction commits, never inside it'

@Injectable()
export class InProcessEventBus implements EventBus {
  private readonly logger = new Logger(InProcessEventBus.name)

  constructor(private readonly registry: DomainEventRegistry) {}

  async publish(events: readonly DomainEvent[]): Promise<void> {
    if (events.length === 0) return

    // the guard that keeps ARCH-39 true: inside a transaction a handler could
    // write through the very transaction that produced the event
    if (hasAmbientTransaction()) throw new Error(IN_TRANSACTION_DISPATCH_MESSAGE)

    for (const event of events) {
      for (const handler of this.registry.handlersFor(event.name)) {
        try {
          await handler.handle(event)
        } catch (error) {
          // the transaction is already committed; a failing handler must not
          // undo it, so this is logged and the remaining handlers still run
          this.logger.error(
            `handler for ${event.name} failed (aggregate ${event.aggregateId.toString()})`,
            error instanceof Error ? error.stack : error,
          )
        }
      }
    }
  }
}
