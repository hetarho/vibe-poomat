import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { auth } from '@repo/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../application/oauth-provider'
import { AuthModule } from '../auth.module'
import { SESSION_IDLE_LIFETIME_MS, Session } from '../domain/session'
import { SESSION_REPOSITORY, type SessionRepository } from '../domain/session.repository'
import { SessionId } from '../domain/session-id'
import { SESSION_ID_GENERATOR, type SessionIdGenerator } from '../domain/session-id-generator'
import { SESSION_CLEANUP_JOB, SessionCleanupJob } from '../infrastructure/session-cleanup.job'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from './auth-cookies'

const STATE = 'the-state'

let nextProfile: ProviderProfile

const client: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(client) }

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    provider: 'github',
    providerUserId: '4242',
    email: 'ada@example.com',
    emailVerified: true,
    displayName: 'Ada Lovelace',
    avatarUrl: 'https://cdn.example.com/ada.png',
    username: 'ada',
    ...overrides,
  }
}

describe('the session guard, me, logout and the cleanup job', () => {
  let app: NestFastifyApplication
  let db: Db
  let sessions: SessionRepository
  let sessionIds: SessionIdGenerator
  let cleanup: SessionCleanupJob

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        PresentationModule,
        HealthModule,
        EventsModule,
        DbModule,
        JobsModule,
        AuthModule,
      ],
    })
      .overrideProvider(OAUTH_PROVIDERS)
      .useValue(registry)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    db = moduleRef.get<Db>(DB)
    sessions = moduleRef.get<SessionRepository>(SESSION_REPOSITORY)
    sessionIds = moduleRef.get<SessionIdGenerator>(SESSION_ID_GENERATOR)
    cleanup = moduleRef.get(SessionCleanupJob)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    nextProfile = profile()
  })

  /** Signs in through the real callback and returns the cookie it was handed. */
  async function signIn(): Promise<string> {
    const response = await app.inject({
      method: 'GET',
      url: `/auth/github/callback?code=the-code&state=${STATE}`,
      cookies: { [OAUTH_STATE_COOKIE]: STATE },
    })
    const raw = response.headers['set-cookie']
    const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
    const cookie = all.find((candidate) => candidate.startsWith(`${SESSION_COOKIE}=`)) ?? ''

    return cookie.slice(`${SESSION_COOKIE}=`.length, cookie.indexOf(';'))
  }

  describe('GET /auth/me', () => {
    it('answers with the owner-only shape from contracts', async () => {
      const session = await signIn()

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(200)
      const body = auth.meSchema.parse(response.json())
      expect(body.handle).toBe('ada')
      expect(body.displayName).toBe('Ada Lovelace')
      // AUTH-4: the owner's own address, and only theirs
      expect(body.email).toBe('ada@example.com')
      expect(body.providers).toEqual(['github'])
    })

    it('lists every provider that reaches the account (AUTH-5)', async () => {
      const session = await signIn()
      nextProfile = profile({ provider: 'google', providerUserId: 'g-1' })
      await signIn()

      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(auth.meSchema.parse(response.json()).providers).toEqual(['github', 'google'])
    })

    it('is 401 without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/me' })

      expect(response.statusCode).toBe(401)
      expect(response.json()).toEqual({ code: 'UNAUTHENTICATED', message: 'not signed in' })
    })

    it('wins over the :provider route, which would otherwise swallow it', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/me' })

      // a 401 rather than a redirect proves the static segment took priority
      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /auth/logout', () => {
    it('deletes the row, clears the cookie, and the same cookie is then 401', async () => {
      const session = await signIn()

      const response = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(204)
      const cleared = String(response.headers['set-cookie'])
      expect(cleared).toContain(`${SESSION_COOKIE}=`)
      expect(cleared).toContain('Max-Age=0')

      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from sessions`,
      )
      expect(rows.rows[0]?.count).toBe('0')

      const after = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(after.statusCode).toBe(401)
    })

    it('is idempotent when nobody was signed in', async () => {
      const response = await app.inject({ method: 'POST', url: '/auth/logout' })

      expect(response.statusCode).toBe(204)
    })

    it('is idempotent when the same cookie is presented twice', async () => {
      const session = await signIn()
      const cookies = { [SESSION_COOKIE]: session }

      await app.inject({ method: 'POST', url: '/auth/logout', cookies })
      const again = await app.inject({ method: 'POST', url: '/auth/logout', cookies })

      expect(again.statusCode).toBe(204)
    })
  })

  describe('the cleanup job', () => {
    it('is registered to run hourly', () => {
      const registered = app.get(JobRegistry).require(SESSION_CLEANUP_JOB)

      expect(registered.cron).toBe('0 * * * *')
    })

    it('removes lapsed rows and leaves live ones alone', async () => {
      const live = await signIn()
      const lapsed = Session.start({
        id: sessionIds.next(),
        userId:
          (await sessions.findById(SessionId.parse(live)._unsafeUnwrap()))?.userId ??
          (() => {
            throw new Error('the sign-in did not store a session')
          })(),
        now: new Date(Date.now() - SESSION_IDLE_LIFETIME_MS - 1000),
      })
      await sessions.save(lapsed)

      await cleanup.handle()

      const rows = await db.execute<{ id: string }>(sql`select id from sessions`)
      expect(rows.rows.map((row) => row.id)).toEqual([live])
    })
  })
})
