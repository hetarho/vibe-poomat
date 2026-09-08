import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { CreditModule } from '../../credit/credit.module'
import { ClaimStoreModule } from '../../feedback/claim-store.module'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { AuthModule } from '../auth.module'
import { TestSessionModule } from '../test-session.module'
import { SESSION_COOKIE } from './auth-cookies'
import { TEST_SESSION_PATH } from './test-session.controller'

const PATH = `/${TEST_SESSION_PATH}`

const FIXTURE = {
  providerUserId: 'e2e-ada',
  username: 'e2eada',
  email: 'e2eada@example.test',
}

const SHARED = [
  ConfigModule,
  PresentationModule,
  HealthModule,
  EventsModule,
  DbModule,
  JobsModule,
  StorageModule,
  CreditModule,
  ClaimStoreModule,
  AuthModule,
]

async function bootFor(nodeEnv: string): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [...SHARED, ...TestSessionModule.forEnv(nodeEnv)],
  }).compile()

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  await registerPlugins(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return app
}

/**
 * The one sanctioned bypass of AUTH-1 (T040). Both halves are proven here: it
 * issues a real session under `test`, and it is not routable at all otherwise —
 * because the module is absent from the graph, not because a guard says no.
 */
describe('the test-only session route, against a real PostgreSQL', () => {
  let underTest: NestFastifyApplication
  let underProduction: NestFastifyApplication

  beforeAll(async () => {
    underTest = await bootFor('test')
    underProduction = await bootFor('production')
  })

  afterAll(async () => {
    await Promise.all([underTest.close(), underProduction.close()])
  })

  describe('with NODE_ENV=test', () => {
    it('issues a session for a fixture account, with no provider involved', async () => {
      const response = await underTest.inject({ method: 'POST', url: PATH, payload: FIXTURE })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ handle: FIXTURE.username })
      const raw = response.headers['set-cookie']
      const cookies = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
      expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toBe(true)
    })

    /** Indistinguishable from a real one: it is the same use case underneath. */
    it('hands back a session the ordinary guard accepts', async () => {
      const created = await underTest.inject({
        method: 'POST',
        url: PATH,
        payload: { ...FIXTURE, providerUserId: 'e2e-bob', username: 'e2ebob', email: 'b@x.test' },
      })
      const raw = created.headers['set-cookie']
      const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
      const cookie = all.find((candidate) => candidate.startsWith(`${SESSION_COOKIE}=`)) ?? ''
      const session = cookie.slice(`${SESSION_COOKIE}=`.length, cookie.indexOf(';'))

      const me = await underTest.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(me.statusCode).toBe(200)
      expect(me.json()).toMatchObject({ handle: 'e2ebob' })
    })

    it('signs the same fixture in again rather than creating a second account', async () => {
      const first = await underTest.inject({ method: 'POST', url: PATH, payload: FIXTURE })
      const again = await underTest.inject({ method: 'POST', url: PATH, payload: FIXTURE })

      expect((again.json() as { id: string }).id).toBe((first.json() as { id: string }).id)
    })

    it('refuses a payload that is not a fixture account', async () => {
      const response = await underTest.inject({
        method: 'POST',
        url: PATH,
        payload: { providerUserId: '', username: '', email: 'not-an-email' },
      })

      expect(response.statusCode).toBeGreaterThanOrEqual(400)
    })
  })

  describe('with any other NODE_ENV', () => {
    it('is not routable at all', async () => {
      const response = await underProduction.inject({
        method: 'POST',
        url: PATH,
        payload: FIXTURE,
      })

      expect(response.statusCode).toBe(404)
    })

    it.each(['production', 'development', '', 'testing'])(
      'contributes no module for %j',
      (nodeEnv) => {
        expect(TestSessionModule.forEnv(nodeEnv)).toEqual([])
      },
    )

    it('contributes exactly one for test', () => {
      expect(TestSessionModule.forEnv('test')).toHaveLength(1)
    })
  })
})
