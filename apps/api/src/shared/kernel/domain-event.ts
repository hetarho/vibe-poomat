import type { EntityId } from './entity-id'

/** Something that happened. Dispatched only after the transaction commits (ARCH-39). */
export abstract class DomainEvent {
  abstract readonly name: string
  readonly aggregateId: EntityId
  readonly occurredAt: Date

  constructor(aggregateId: EntityId, occurredAt: Date = new Date()) {
    this.aggregateId = aggregateId
    this.occurredAt = occurredAt
  }
}
