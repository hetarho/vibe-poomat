import type { DomainEvent } from '../kernel'

export const DOMAIN_EVENT_COLLECTOR = Symbol('DOMAIN_EVENT_COLLECTOR')

/**
 * Repositories hand an aggregate's drained events here while saving it; the
 * aggregate never dispatches anything itself.
 */
export type DomainEventCollector = {
  collect(events: readonly DomainEvent[]): void
}
