import type { Pool, PoolClient } from 'pg'
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

/** A pool whose one connection records the transaction statements it is given. */
function fakePool() {
  const statements: string[] = []
  const client = {
    query: vi.fn(async (text: string) => {
      statements.push(text)

      return { rows: [] }
    }),
    release: vi.fn(),
  }
  const pool = {
    connect: vi.fn(async () => client as unknown as PoolClient),
  } as unknown as Pool
  const tx = { marker: 'the transaction' } as unknown as Db

  return { pool, client, statements, tx, toDb: () => tx }
}

function busSpy(): { bus: EventBus; published: string[][] } {
  const published: string[][] = []

  return {
    published,
    bus: {
      publish: async (events) => {
        published.push(events.map((event) => event.name))
      },
    },
  }
}

describe('DrizzleTransactionManager', () => {
  it('brackets the work in begin and commit on one connection', async () => {
    const { pool, statements, client, toDb } = fakePool()
    const { bus } = busSpy()

    await new DrizzleTransactionManager(pool, bus, toDb).run(async () => undefined)

    expect(statements).toEqual(['begin', 'commit'])
    expect(client.release).toHaveBeenCalledOnce()
  })

  it('rolls back and releases the connection when the work throws', async () => {
    const { pool, statements, client, toDb } = fakePool()
    const { bus, published } = busSpy()

    await expect(
      new DrizzleTransactionManager(pool, bus, toDb).run(async () => {
        throw new Error('the use case failed')
      }),
    ).rejects.toThrow('the use case failed')

    expect(statements).toEqual(['begin', 'rollback'])
    expect(client.release).toHaveBeenCalledOnce()
    expect(published).toEqual([])
  })

  it('makes the transaction the ambient database for the whole call', async () => {
    const { pool, tx, toDb } = fakePool()
    const { bus } = busSpy()
    setPooledDb({ marker: 'the pool' } as unknown as Db)

    const seen = await new DrizzleTransactionManager(pool, bus, toDb).run(async () => getDb())

    expect(seen).toBe(tx)
    expect(getDb()).not.toBe(tx)
    setPooledDb(undefined)
  })

  it('joins the outer transaction instead of opening a second one', async () => {
    const { pool, tx, toDb } = fakePool()
    const { bus } = busSpy()
    const manager = new DrizzleTransactionManager(pool, bus, toDb)

    const inner = await manager.run(async () => manager.run(async () => getDb()))

    expect(inner).toBe(tx)
    expect(pool.connect).toHaveBeenCalledOnce()
  })

  it('publishes collected events once, and only after the commit', async () => {
    const { pool, statements, toDb } = fakePool()
    const collector = new ScopedDomainEventCollector()
    let statementsWhenPublished: string[] = []
    const bus: EventBus = {
      publish: async () => {
        statementsWhenPublished = [...statements]
      },
    }

    await new DrizzleTransactionManager(pool, bus, toDb).run(async () => {
      collector.collect([new ThingHappened(EntityId.generate())])
    })

    expect(statementsWhenPublished).toEqual(['begin', 'commit'])
  })

  it('leaves no ambient transaction behind once it returns', async () => {
    const { pool, toDb } = fakePool()
    const { bus } = busSpy()

    await new DrizzleTransactionManager(pool, bus, toDb).run(async () => undefined)

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
