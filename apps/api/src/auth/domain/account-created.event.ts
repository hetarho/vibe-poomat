import { CROSS_CONTEXT_EVENTS, DomainEvent, type EntityId } from '../../shared/kernel'

/**
 * Signup happened (AUTH-2). Dispatched after the transaction commits (ARCH-39);
 * the credit context subscribes to it for the seed grant, and nothing here knows
 * that credits exist.
 */
export class AccountCreated extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.accountCreated

  constructor(
    userId: EntityId,
    readonly handle: string,
    occurredAt?: Date,
  ) {
    super(userId, occurredAt)
  }

  get userId(): EntityId {
    return this.aggregateId
  }
}
