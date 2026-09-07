import type { DomainEvent } from '../kernel'

export const EVENT_BUS = Symbol('EVENT_BUS')

export type DomainEventHandler = {
  /** The `name` of the events this handler wants. */
  readonly eventName: string
  handle(event: DomainEvent): Promise<void>
}

/**
 * Dispatches in process, and only after the transaction has committed (ARCH-39).
 * A handler may reach other contexts through their application services or
 * enqueue a job; it may never write inside the transaction that produced it.
 */
export type EventBus = {
  publish(events: readonly DomainEvent[]): Promise<void>
}
