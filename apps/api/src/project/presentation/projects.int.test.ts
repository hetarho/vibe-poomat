import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { projects as contract } from '@repo/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../../auth/application/oauth-provider'
import { AuthModule } from '../../auth/auth.module'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../../auth/presentation/auth-cookies'
import { registerPlugins } from '../../bootstrap'
import { CreditModule } from '../../credit/credit.module'
import { ClaimStoreModule } from '../../feedback/feedback.module'
import { HTTP_PROBE } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { ACTIVE_MISSION_READER } from '../domain/mission.repository'
import { ProjectModule } from '../project.module'
import { StubActiveMissions, StubHttpProbe } from '../test-support/project-doubles'

const STATE = 'the-state'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

/**
 * The whole surface against a real PostgreSQL, with only the OAuth provider and
 * the outbound probe replaced — the probe because PROJ-2 must not depend on some
 * third party being up, and the mission reader because missions arrive in T023.
 */
describe('the project endpoints, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let missions: StubActiveMissions

  beforeAll(async () => {
    probe = new StubHttpProbe()
    missions = new StubActiveMissions()

    const moduleRef = await Test.createTestingModule({
      imports: [
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
        ProjectModule,
      ],
    })
      .overrideProvider(OAUTH_PROVIDERS)
      .useValue(registry)
      .overrideProvider(HTTP_PROBE)
      .useValue(probe)
      .overrideProvider(ACTIVE_MISSION_READER)
      .useValue(missions)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    db = moduleRef.get<Db>(DB)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
    missions.close()
  })

  async function signIn(providerUserId = '4242', username = 'ada'): Promise<string> {
    nextProfile = {
      provider: 'github',
      providerUserId,
      email: `${username}@example.com`,
      emailVerified: true,
      displayName: username,
      avatarUrl: null,
      username,
    }
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

  async function post(session: string, body: object) {
    return app.inject({
      method: 'POST',
      url: '/projects',
      payload: body,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  async function createProject(session: string, overrides: object = {}): Promise<string> {
    const response = await post(session, {
      title: 'Poomat',
      liveUrl: 'https://poomat.test',
      pitch: 'Trade real feedback',
      tags: ['SaaS'],
      ...overrides,
    })

    return contract.projectSchema.parse(response.json()).id
  }

  describe('POST /projects', () => {
    it('creates a public project with its owner attached', async () => {
      const session = await signIn()

      const response = await post(session, {
        title: 'Poomat',
        liveUrl: 'https://poomat.test',
        pitch: 'Trade real feedback',
        tags: ['SaaS', 'Tool'],
        description: '# Hello',
      })

      expect(response.statusCode).toBe(201)
      const body = contract.projectSchema.parse(response.json())
      expect(body.owner.handle).toBe('ada')
      expect(body.tags).toEqual(['SaaS', 'Tool'])
      // markdown is stored raw; nothing here turns it into HTML
      expect(body.description).toBe('# Hello')
      expect(probe.probed).toEqual(['https://poomat.test/'])
    })

    it('is 401 without a session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/projects',
        payload: { title: 'x', liveUrl: 'https://a.test', pitch: 'x', tags: ['SaaS'] },
      })

      expect(response.statusCode).toBe(401)
    })

    it('refuses an unreachable url and writes no row (PROJ-2)', async () => {
      const session = await signIn()
      probe.refuseNext()

      const response = await post(session, {
        title: 'Poomat',
        liveUrl: 'https://gone.test',
        pitch: 'Trade real feedback',
        tags: ['SaaS'],
      })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        code: 'PROJECT_URL_UNREACHABLE',
        details: { status: 503 },
      })
      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from projects`,
      )
      expect(rows.rows[0]?.count).toBe('0')
    })
  })

  describe('GET /projects/:id', () => {
    it('is readable with no session at all', async () => {
      const session = await signIn()
      const projectId = await createProject(session)

      const response = await app.inject({ method: 'GET', url: `/projects/${projectId}` })

      expect(response.statusCode).toBe(200)
      expect(contract.projectSchema.parse(response.json()).id).toBe(projectId)
    })

    it('carries the open mission when there is one (PROJ-5)', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      missions.open({ slots: 3, openSlots: 1 })

      const response = await app.inject({ method: 'GET', url: `/projects/${projectId}` })

      expect(contract.projectSchema.parse(response.json()).activeMission).toMatchObject({
        slots: 3,
        openSlots: 1,
      })
    })

    it.each(['not-an-id', '01920000-0000-7000-8000-0000000000ff'])('is 404 for %s', async (id) => {
      const response = await app.inject({ method: 'GET', url: `/projects/${id}` })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'PROJECT_NOT_FOUND' })
    })
  })

  describe('DELETE /projects/:id (PROJ-8)', () => {
    it('takes it out of every public read while the owner keeps it', async () => {
      const session = await signIn()
      const projectId = await createProject(session)

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(deleted.statusCode).toBe(204)

      const anonymous = await app.inject({ method: 'GET', url: `/projects/${projectId}` })
      expect(anonymous.statusCode).toBe(404)

      const owner = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(owner.statusCode).toBe(200)
      expect(contract.projectSchema.parse(owner.json()).deletedAt).not.toBeNull()

      // the row is still there, because the feedback on it has to stay readable
      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from projects where deleted_at is not null`,
      )
      expect(rows.rows[0]?.count).toBe('1')
    })

    it('hides it from another signed-in reader too', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })

      const stranger = await signIn('bob-1', 'bob')
      const response = await app.inject({
        method: 'GET',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: stranger },
      })

      expect(response.statusCode).toBe(404)
    })

    it('is blocked while a mission is open', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      missions.open()

      const response = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'PROJECT_LOCKED_BY_MISSION' })
    })

    it('refuses a stranger', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const stranger = await signIn('bob-1', 'bob')

      const response = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: stranger },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('PATCH /projects/:id (PROJ-7)', () => {
    it('blocks a live url change while a mission is open, and allows it after', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      missions.open()
      probe.probed.length = 0

      const blocked = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}`,
        payload: { liveUrl: 'https://poomat.test/v2' },
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(blocked.statusCode).toBe(409)
      expect(probe.probed).toEqual([])

      missions.close()
      const allowed = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}`,
        payload: { liveUrl: 'https://poomat.test/v2' },
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(allowed.statusCode).toBe(200)
      // re-verified, because the feedbackers will be sent somewhere new
      expect(probe.probed).toEqual(['https://poomat.test/v2'])
      expect(contract.projectSchema.parse(allowed.json()).liveUrl).toBe('https://poomat.test/v2')
    })

    it('still edits the pitch, tags and cover with a mission open', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      missions.open()

      const response = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}`,
        payload: { pitch: 'Sharper now', tags: ['AI'] },
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(200)
      const body = contract.projectSchema.parse(response.json())
      expect(body.pitch).toBe('Sharper now')
      expect(body.tags).toEqual(['AI'])
    })

    it('refuses a stranger', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const stranger = await signIn('bob-1', 'bob')

      const response = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}`,
        payload: { pitch: 'Mine now' },
        cookies: { [SESSION_COOKIE]: stranger },
      })

      expect(response.statusCode).toBe(403)
    })
  })
})
