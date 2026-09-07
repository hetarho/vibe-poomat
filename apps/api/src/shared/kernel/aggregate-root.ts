import type { DomainEvent } from './domain-event'
import { Entity } from './entity'

/**
 * An entity that collects its own events. The application layer drains them with
 * `pullEvents()` once the transaction has committed, so a handler can never
 * re-enter the transaction that produced them (ARCH-39).
 */
export abstract class AggregateRoot<TProps extends object> extends Entity<TProps> {
  private events: DomainEvent[] = []

  protected record(event: DomainEvent): void {
    this.events.push(event)
  }

  pullEvents(): readonly DomainEvent[] {
    const drained = this.events
    this.events = []

    return drained
  }
}
