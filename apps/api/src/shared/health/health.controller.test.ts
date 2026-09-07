import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { configureApp } from '../../bootstrap'
import { fakeEnv } from '../../test-support/fake-env'
import { HealthModule } from './health.module'
import { ReadinessRegistry } from './readiness-registry'

describe('health endpoints', () => {
  let app: NestFastifyApplication
  let registry: ReadinessRegistry

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    configureApp(app, fakeEnv())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
    registry = app.get(ReadinessRegistry)
  })

  afterEach(async () => {
    await app.close()
  })

  it('answers /health with 200 ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('answers /health with 200 even while readiness is failing', async () => {
    registry.register({ name: 'db', check: async () => false })
    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('answers /ready with 200 when no indicator is registered', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ready', checks: {} })
  })

  it('answers /ready with 503 and the failing check when an indicator fails', async () => {
    registry.register({ name: 'db', check: async () => false })
    const response = await app.inject({ method: 'GET', url: '/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'not-ready', checks: { db: false } })
  })

  it('advertises only the configured web origin, whoever is asking', async () => {
    // a single string origin is echoed verbatim, so a foreign caller is told the
    // one allowed origin and the browser is the party that rejects the mismatch
    for (const origin of [fakeEnv().WEB_URL, 'https://evil.test']) {
      const response = await app.inject({ method: 'GET', url: '/health', headers: { origin } })

      expect(response.headers['access-control-allow-origin']).toBe(fakeEnv().WEB_URL)
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    }
  })

  it('keeps both probes at the root, outside the /api/v1 prefix', async () => {
    await expect(app.inject({ method: 'GET', url: '/api/v1/health' })).resolves.toMatchObject({
      statusCode: 404,
    })
    await expect(app.inject({ method: 'GET', url: '/api/v1/ready' })).resolves.toMatchObject({
      statusCode: 404,
    })
  })
})
