import { describe, expect, it, vi } from 'vitest'
import type { EventBus } from '../application'
import { DomainEvent, EntityId } from '../kernel'
import type { Db } from './db.token'
import { getDb, setPooledDb } from './db-context'
import { DrizzleTransactionManager } from './drizzle-transaction-manager'
import { ScopedDomainEventCollector } from './scoped-event-collector'
import { hasAmbientTransaction } from './transaction-scope'

class ThingHappened extends DomainEvent {
  readonly name = 'thing.happened'
}

/** Stands in for a Drizzle client: hands a marker "tx" to the callback. */
function fakeDb(): { db: Db; tx: Db; committed: () => boolean } {
  const tx = { marker: 'the transaction' } as unknown as Db
  let committed = false
  const db = {
    transaction: async <T>(work: (tx: Db) => Promise<T>): Promise<T> => {
      const result = await work(tx)
      committed = true

      return result
    },
  } as unknown as Db

  return { db, tx, committed: () => committed }
}

function busSpy(): { bus: EventBus; published: string[][] } {
  const published: string[][] = []
  const bus: EventBus = {
    publish: async (events) => {
      published.push(events.map((event) => event.name))
    },
  }

  return { bus, published }
}

describe('DrizzleTransactionManager', () => {
  it('makes the transaction the ambient database for the whole call', async () => {
    const { db, tx } = fakeDb()
    const { bus } = busSpy()
    setPooledDb({ marker: 'the pool' } as unknown as Db)

    const seen = await new DrizzleTransactionManager(db, bus).run(async () => getDb())

    expect(seen).toBe(tx)
    expect(getDb()).not.toBe(tx)
    setPooledDb(undefined)
  })

  it('joins the outer transaction instead of opening a second one', async () => {
    const { db, tx } = fakeDb()
    const { bus } = busSpy()
    const transaction = vi.spyOn(db, 'transaction')
    const manager = new DrizzleTransactionManager(db, bus)

    const inner = await manager.run(async () => manager.run(async () => getDb()))

    expect(inner).toBe(tx)
    expect(transaction).toHaveBeenCalledTimes(1)
  })

  it('publishes collected events once, and only after the commit', async () => {
    const { db, committed } = fakeDb()
    const { bus, published } = busSpy()
    const collector = new ScopedDomainEventCollector()
    let committedWhenPublished: boolean | undefined
    const watchingBus: EventBus = {
      publish: async (events) => {
        committedWhenPublished = committed()
        await bus.publish(events)
      },
    }

    await new DrizzleTransactionManager(db, watchingBus).run(async () => {
      collector.collect([new ThingHappened(EntityId.generate())])
    })

    expect(published).toEqual([['thing.happened']])
    expect(committedWhenPublished).toBe(true)
  })

  it('publishes nothing when the work throws', async () => {
    const tx = {} as unknown as Db
    const db = {
      transaction: async <T>(work: (tx: Db) => Promise<T>): Promise<T> => work(tx),
    } as unknown as Db
    const { bus, published } = busSpy()
    const collector = new ScopedDomainEventCollector()

    await expect(
      new DrizzleTransactionManager(db, bus).run(async () => {
        collector.collect([new ThingHappened(EntityId.generate())])
        throw new Error('the use case failed')
      }),
    ).rejects.toThrow('the use case failed')

    expect(published).toEqual([])
  })

  it('leaves no ambient transaction behind once it returns', async () => {
    const { db } = fakeDb()
    const { bus } = busSpy()

    await new DrizzleTransactionManager(db, bus).run(async () => undefined)

    expect(hasAmbientTransaction()).toBe(false)
  })

  it('collects nothing when there is no transaction to commit', () => {
    const collector = new ScopedDomainEventCollector()

    expect(() => collector.collect([new ThingHappened(EntityId.generate())])).not.toThrow()
  })
})

describe('getDb', () => {
  it('says so plainly when DbModule has not initialised', () => {
    setPooledDb(undefined)

    expect(() => getDb()).toThrow(/DbModule has not initialised/)
  })
})
