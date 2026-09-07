import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConfigModule } from '../config/config.module'
import { HealthModule } from '../health/health.module'
import { ReadinessRegistry } from '../health/readiness-registry'
import { DbModule } from './db.module'
import { DB, type Db } from './db.token'

describe('DbModule against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let db: Db

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, DbModule],
    }).compile()
    await moduleRef.init()
    db = moduleRef.get<Db>(DB)
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  it('hands out a client that reaches the database', async () => {
    const result = await db.execute(sql`select 1 as one`)

    expect(result.rows).toEqual([{ one: 1 }])
  })

  it('has run the migrations, so drizzle bookkeeping is in place', async () => {
    const result = await db.execute<{ present: string | null }>(
      sql`select to_regclass('drizzle.__drizzle_migrations')::text as present`,
    )

    expect(result.rows[0]?.present).toBe('drizzle.__drizzle_migrations')
  })

  it('registers a db indicator that passes while the database is up', async () => {
    const report = await moduleRef.get(ReadinessRegistry).report()

    expect(report).toEqual({ ready: true, checks: { db: true } })
  })
})
