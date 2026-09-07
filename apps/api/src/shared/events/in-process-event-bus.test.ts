import { Logger } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import type { DomainEventHandler } from '../application'
import type { Db } from '../db/db.token'
import { transactionScope } from '../db/transaction-scope'
import { DomainEvent, EntityId } from '../kernel'
import { DomainEventRegistry } from './domain-event-registry'
import { IN_TRANSACTION_DISPATCH_MESSAGE, InProcessEventBus } from './in-process-event-bus'

class ThingHappened extends DomainEvent {
  readonly name = 'thing.happened'
}

class OtherThingHappened extends DomainEvent {
  readonly name = 'other.happened'
}

function handler(eventName: string, handle: DomainEventHandler['handle']): DomainEventHandler {
  return { eventName, handle }
}

describe('InProcessEventBus', () => {
  it('gives each event to every handler registered for its name', async () => {
    const registry = new DomainEventRegistry()
    const first = vi.fn(async () => undefined)
    const second = vi.fn(async () => undefined)
    const unrelated = vi.fn(async () => undefined)
    registry.register(handler('thing.happened', first))
    registry.register(handler('thing.happened', second))
    registry.register(handler('other.happened', unrelated))

    await new InProcessEventBus(registry).publish([new ThingHappened(EntityId.generate())])

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
    expect(unrelated).not.toHaveBeenCalled()
  })

  it('ignores an event nobody handles', async () => {
    await expect(
      new InProcessEventBus(new DomainEventRegistry()).publish([
        new OtherThingHappened(EntityId.generate()),
      ]),
    ).resolves.toBeUndefined()
  })

  it('logs a failing handler and still runs the rest', async () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const registry = new DomainEventRegistry()
    const survivor = vi.fn(async () => undefined)
    registry.register(
      handler('thing.happened', async () => {
        throw new Error('the handler blew up')
      }),
    )
    registry.register(handler('thing.happened', survivor))

    await expect(
      new InProcessEventBus(registry).publish([new ThingHappened(EntityId.generate())]),
    ).resolves.toBeUndefined()

    expect(survivor).toHaveBeenCalledOnce()
    expect(logged).toHaveBeenCalledOnce()
    logged.mockRestore()
  })

  it('refuses to dispatch from inside a transaction, so a handler can never reuse it', async () => {
    const registry = new DomainEventRegistry()
    const never = vi.fn(async () => undefined)
    registry.register(handler('thing.happened', never))
    const bus = new InProcessEventBus(registry)

    await expect(
      transactionScope.run({ tx: {} as unknown as Db, events: [] }, async () =>
        bus.publish([new ThingHappened(EntityId.generate())]),
      ),
    ).rejects.toThrow(IN_TRANSACTION_DISPATCH_MESSAGE)

    expect(never).not.toHaveBeenCalled()
  })
})

describe('DomainEventRegistry', () => {
  it('has no handlers for an unregistered name', () => {
    expect(new DomainEventRegistry().handlersFor('nothing.registered')).toEqual([])
  })
})
