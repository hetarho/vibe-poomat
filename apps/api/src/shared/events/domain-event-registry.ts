import { Injectable } from '@nestjs/common'
import type { DomainEventHandler } from '../application'

/**
 * Handlers register themselves in `onModuleInit`, the same way readiness
 * indicators do, so a context adds a handler without this file changing.
 */
@Injectable()
export class DomainEventRegistry {
  private readonly handlers = new Map<string, DomainEventHandler[]>()

  register(handler: DomainEventHandler): void {
    const existing = this.handlers.get(handler.eventName)
    if (existing === undefined) this.handlers.set(handler.eventName, [handler])
    else existing.push(handler)
  }

  handlersFor(eventName: string): readonly DomainEventHandler[] {
    return this.handlers.get(eventName) ?? []
  }
}
