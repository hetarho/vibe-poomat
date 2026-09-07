import { Controller, Get, Post } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Throttle } from '@nestjs/throttler'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fastifyServerOptions } from '../../../bootstrap'
import { ConfigModule } from '../../config/config.module'
import { DbModule } from '../../db/db.module'
import { getDb } from '../../db/db-context'
import { EventsModule } from '../../events/events.module'
import { HealthModule } from '../../health/health.module'
import { PresentationModule } from '../../presentation/presentation.module'
import { PgThrottlerStorage } from './pg-throttler-storage'
import { WRITE_THROTTLER } from './throttler-policy'
import { ThrottlingModule } from './throttling.module'

const WRITE_LIMIT = 3

@Controller('probe')
class ProbeController {
  @Get()
  read(): { ok: true } {
    return { ok: true }
  }

  @Post()
  @Throttle({ [WRITE_THROTTLER]: { limit: WRITE_LIMIT, ttl: 60_000, blockDuration: 60_000 } })
  write(): { ok: true } {
    return { ok: true }
  }
}

describe('rate limiting against a real PostgreSQL', () => {
  let app: NestFastifyApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        HealthModule,
        EventsModule,
        DbModule,
        PresentationModule,
        ThrottlingModule,
      ],
      controllers: [ProbeController],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(fastifyServerOptions),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  }, 180_000)

  afterAll(async () => {
    await app.close()
  })

  async function post(ip: string) {
    return app.inject({ method: 'POST', url: '/probe', headers: { 'x-forwarded-for': ip } })
  }

  it('lets a mutating route through up to its limit', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < WRITE_LIMIT; attempt += 1) {
      statuses.push((await post('203.0.113.10')).statusCode)
    }

    expect(statuses).toEqual([201, 201, 201])
  })

  it('answers the next one with 429 in the standard error shape', async () => {
    for (let attempt = 0; attempt < WRITE_LIMIT; attempt += 1) await post('203.0.113.20')

    const response = await post('203.0.113.20')

    expect(response.statusCode).toBe(429)
    expect(response.json()).toMatchObject({ code: 'RATE_LIMITED' })
    expect(Object.keys(response.json() as object).sort()).toEqual(['code', 'message'])
  })

  it('counts each caller separately', async () => {
    for (let attempt = 0; attempt < WRITE_LIMIT + 1; attempt += 1) await post('203.0.113.30')

    const other = await post('203.0.113.40')

    expect(other.statusCode).toBe(201)
  })

  it('does not throttle a read at the mutating limit', async () => {
    const statuses: number[] = []
    for (let attempt = 0; attempt < WRITE_LIMIT + 2; attempt += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/probe',
        headers: { 'x-forwarded-for': '203.0.113.60' },
      })
      statuses.push(response.statusCode)
    }

    expect(statuses.every((status) => status === 200)).toBe(true)
  })
})

describe('PgThrottlerStorage against a real PostgreSQL', () => {
  let moduleRef: Awaited<ReturnType<typeof buildStorageModule>>

  async function buildStorageModule() {
    const built = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule],
      providers: [PgThrottlerStorage],
    }).compile()
    await built.init()

    return built
  }

  beforeAll(async () => {
    moduleRef = await buildStorageModule()
  }, 180_000)

  afterAll(async () => {
    await moduleRef.close()
  })

  it('counts hits inside one window and reports when the window ends', async () => {
    const storage = moduleRef.get(PgThrottlerStorage)

    const first = await storage.increment('counted', 60, 5, 60, 'write')
    const second = await storage.increment('counted', 60, 5, 60, 'write')

    expect(first.totalHits).toBe(1)
    expect(second.totalHits).toBe(2)
    expect(second.isBlocked).toBe(false)
    expect(second.timeToExpire).toBeGreaterThan(0)
  })

  it('blocks once the limit is passed, and says for how long', async () => {
    const storage = moduleRef.get(PgThrottlerStorage)
    let record = await storage.increment('blocked', 60, 2, 30, 'write')
    record = await storage.increment('blocked', 60, 2, 30, 'write')
    expect(record.isBlocked).toBe(false)

    record = await storage.increment('blocked', 60, 2, 30, 'write')

    expect(record.isBlocked).toBe(true)
    expect(record.timeToBlockExpire).toBeGreaterThan(0)
  })

  it('starts a fresh window once the old one has expired', async () => {
    const storage = moduleRef.get(PgThrottlerStorage)
    await storage.increment('rolling', 60, 5, 60, 'write')

    // the window is pushed into the past rather than waited out: a sleep long
    // enough to be reliable under load would only make the suite slower
    await getDb().execute(
      sql`update rate_limits set expires_at = now() - interval '1 second' where key = 'write:rolling'`,
    )

    const record = await storage.increment('rolling', 60, 5, 60, 'write')

    expect(record.totalHits).toBe(1)
  })

  it('keeps buckets with the same key but different names apart', async () => {
    const storage = moduleRef.get(PgThrottlerStorage)
    await storage.increment('shared-key', 60, 5, 60, 'read')

    const write = await storage.increment('shared-key', 60, 5, 60, 'write')

    expect(write.totalHits).toBe(1)
  })
})
