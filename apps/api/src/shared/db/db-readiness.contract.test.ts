import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HealthModule } from '../health/health.module'
import { ReadinessRegistry } from '../health/readiness-registry'
import { DbReadinessIndicator } from './db-readiness.indicator'

describe('/ready with a database that is down', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    app.get(ReadinessRegistry).register(
      new DbReadinessIndicator({
        query: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:5432')
        },
      }),
    )
  })

  afterEach(async () => {
    await app.close()
  })

  it('answers 503 and names db as the failing check', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'not-ready', checks: { db: false } })
  })
})
