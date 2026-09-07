import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  DOMAIN_EVENT_COLLECTOR,
  type DomainEventCollector,
  EVENT_BUS,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../application'
import { ConfigModule } from '../config/config.module'
import { DomainEventRegistry } from '../events/domain-event-registry'
import { EventsModule } from '../events/events.module'
import { HealthModule } from '../health/health.module'
import { DomainEvent, EntityId } from '../kernel'
import { DbModule } from './db.module'
import { DB, type Db } from './db.token'
import { getDb } from './db-context'

class ProbeSaved extends DomainEvent {
  readonly name = 'probe.saved'
}

/** Two independent "repositories": neither takes a transaction argument. */
async function insertProbe(label: string): Promise<void> {
  await getDb().execute(
    sql`insert into tx_probe (id, label) values (${EntityId.generate().value}, ${label})`,
  )
}

async function probeLabels(db: Db): Promise<string[]> {
  const result = await db.execute<{ label: string }>(sql`select label from tx_probe order by label`)

  return result.rows.map((row) => row.label)
}

async function currentXactId(): Promise<string> {
  const result = await getDb().execute<{ id: string }>(sql`select pg_current_xact_id()::text as id`)

  return String(result.rows[0]?.id)
}

describe('one transaction per use case, against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let manager: TransactionManager
  let collector: DomainEventCollector
  let registry: DomainEventRegistry
  let db: Db

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule],
    }).compile()
    await moduleRef.init()

    manager = moduleRef.get<TransactionManager>(TRANSACTION_MANAGER)
    collector = moduleRef.get<DomainEventCollector>(DOMAIN_EVENT_COLLECTOR)
    registry = moduleRef.get(DomainEventRegistry)
    db = moduleRef.get<Db>(DB)

    await db.execute(
      sql`create table if not exists tx_probe (id uuid primary key, label text not null)`,
    )
  })

  afterAll(async () => {
    await db.execute(sql`drop table if exists tx_probe`)
    await moduleRef.close()
  })

  it('commits both repositories together', async () => {
    await manager.run(async () => {
      await insertProbe('first')
      await insertProbe('second')
    })

    await expect(probeLabels(db)).resolves.toEqual(['first', 'second'])
  })

  it('rolls both repositories back when the second write throws', async () => {
    await expect(
      manager.run(async () => {
        await insertProbe('kept-if-committed')
        await insertProbe('kept-if-committed')
        throw new Error('the use case failed after writing')
      }),
    ).rejects.toThrow('the use case failed after writing')

    await expect(probeLabels(db)).resolves.toEqual([])
  })

  it('shares one transaction across a nested run', async () => {
    const [outer, inner] = await manager.run(async () => {
      const outerId = await currentXactId()
      const innerId = await manager.run(async () => currentXactId())

      return [outerId, innerId]
    })

    expect(outer).toBe(inner)
  })

  it('rolls a nested write back with the outer transaction', async () => {
    await expect(
      manager.run(async () => {
        await manager.run(async () => {
          await insertProbe('written-in-the-nested-run')
        })
        throw new Error('the outer use case failed')
      }),
    ).rejects.toThrow('the outer use case failed')

    await expect(probeLabels(db)).resolves.toEqual([])
  })

  it('dispatches an event once after the commit, with the write visible to the handler', async () => {
    const seen: string[] = []
    registry.register({
      eventName: 'probe.saved',
      handle: async () => {
        seen.push(...(await probeLabels(db)))
      },
    })

    await manager.run(async () => {
      await insertProbe('visible-to-the-handler')
      collector.collect([new ProbeSaved(EntityId.generate())])
    })

    expect(seen).toEqual(['visible-to-the-handler'])
  })

  it('dispatches nothing when the transaction rolls back', async () => {
    const handle = vi.fn(async () => undefined)
    registry.register({ eventName: 'probe.saved', handle })

    await expect(
      manager.run(async () => {
        await insertProbe('never-committed')
        collector.collect([new ProbeSaved(EntityId.generate())])
        throw new Error('rolled back')
      }),
    ).rejects.toThrow('rolled back')

    expect(handle).not.toHaveBeenCalled()
    await expect(probeLabels(db)).resolves.toEqual([])
  })
})
