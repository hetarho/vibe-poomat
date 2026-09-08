import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { auth } from '@repo/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { DELETE_OBJECT_JOB, JOB_SCHEDULER, type JobScheduler } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../application/oauth-provider'
import { AuthModule } from '../auth.module'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from './auth-cookies'

const STATE = 'the-state'
const KEY = 'avatar/01920000-0000-7000-8000-000000000001.png'
const OTHER_KEY = 'avatar/01920000-0000-7000-8000-000000000002.png'
const PROVIDER_AVATAR = 'https://cdn.example.com/from-github.png'

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
    avatarUrl: PROVIDER_AVATAR,
    username: 'ada',
    ...overrides,
  }
}

describe('the profile endpoints, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let enqueued: { name: string; data: object }[]

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        PresentationModule,
        HealthModule,
        EventsModule,
        DbModule,
        JobsModule,
        StorageModule,
        AuthModule,
      ],
    })
      .overrideProvider(OAUTH_PROVIDERS)
      .useValue(registry)
      .overrideProvider(JOB_SCHEDULER)
      .useValue({
        // recorded rather than run: what matters here is that the deletion was
        // scheduled, and by whom, not that MinIO acted on it
        enqueue: async (name: string, data: object) => {
          enqueued.push({ name, data })
        },
        schedule: async () => undefined,
        cancel: async () => undefined,
      } satisfies JobScheduler)
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
    enqueued = []
    nextProfile = profile()
  })

  async function signIn(overrides: Partial<ProviderProfile> = {}): Promise<string> {
    nextProfile = profile(overrides)
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

  function patch(url: string, session: string, body: object) {
    return app.inject({
      method: 'PATCH',
      url,
      payload: body,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  describe('GET /users/by-handle/:handle', () => {
    it('answers with the public shape and no email, ever (AUTH-4)', async () => {
      await signIn()

      const response = await app.inject({ method: 'GET', url: '/users/by-handle/ada' })

      expect(response.statusCode).toBe(200)
      const body = auth.publicProfileSchema.parse(response.json())
      expect(body.handle).toBe('ada')
      expect(body.avatarUrl).toBe(PROVIDER_AVATAR)
      expect(body.credits).toEqual({ balance: 0, received: 0, given: 0 })
      expect(JSON.stringify(response.json())).not.toContain('ada@example.com')
    })

    it('is reachable with no session at all', async () => {
      await signIn()

      const response = await app.inject({ method: 'GET', url: '/users/by-handle/ada' })

      expect(response.statusCode).toBe(200)
    })

    it('finds the account whatever case the handle is asked with', async () => {
      await signIn()

      const response = await app.inject({ method: 'GET', url: '/users/by-handle/ADA' })

      expect(response.statusCode).toBe(200)
      expect(auth.publicProfileSchema.parse(response.json()).handle).toBe('ada')
    })

    it.each(['nobody', 'ab', 'not a handle'])('is 404 for %j', async (handle) => {
      const response = await app.inject({
        method: 'GET',
        url: `/users/by-handle/${encodeURIComponent(handle)}`,
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'AUTH_USER_NOT_FOUND' })
    })
  })

  describe('PATCH /users/me', () => {
    it('applies a partial edit and leaves the rest alone', async () => {
      const session = await signIn()

      const response = await patch('/users/me', session, { bio: 'builds things' })

      expect(response.statusCode).toBe(200)
      const body = auth.publicProfileSchema.parse(response.json())
      expect(body.bio).toBe('builds things')
      expect(body.displayName).toBe('Ada Lovelace')
      expect(body.avatarUrl).toBe(PROVIDER_AVATAR)
    })

    it('is 401 without a session', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/users/me',
        payload: { bio: 'x' },
      })

      expect(response.statusCode).toBe(401)
    })

    it('refuses a bio past the limit with a validation code and writes nothing', async () => {
      const session = await signIn()

      const response = await patch('/users/me', session, { bio: 'x'.repeat(161) })

      // the contract schema catches it before the use case does, and either way
      // the caller learns which field it was
      expect(response.statusCode).toBe(422)
      const rows = await db.execute<{ bio: string | null }>(sql`select bio from users`)
      expect(rows.rows[0]?.bio).toBeNull()
    })

    it('refuses a link that is not https', async () => {
      const session = await signIn()

      const response = await patch('/users/me', session, { link: 'http://example.com' })

      expect(response.statusCode).toBe(422)
    })

    describe('the avatar', () => {
      it('stores the key and answers with a resolved public URL', async () => {
        const session = await signIn()

        const response = await patch('/users/me', session, { avatarKey: KEY })

        expect(auth.publicProfileSchema.parse(response.json()).avatarUrl).toContain(KEY)
        const rows = await db.execute<{ avatar_url: string }>(sql`select avatar_url from users`)
        // the column holds the key, not the resolved URL, so moving the bucket
        // never means rewriting every row
        expect(rows.rows[0]?.avatar_url).toBe(KEY)
      })

      it('never enqueues a deletion for the provider-supplied URL', async () => {
        const session = await signIn()

        await patch('/users/me', session, { avatarKey: KEY })

        expect(enqueued).toEqual([])
      })

      it('enqueues the previous object exactly once when it is replaced', async () => {
        const session = await signIn()
        await patch('/users/me', session, { avatarKey: KEY })

        await patch('/users/me', session, { avatarKey: OTHER_KEY })

        expect(enqueued).toEqual([{ name: DELETE_OBJECT_JOB, data: { key: KEY } }])
      })

      it('refuses a key from another purpose', async () => {
        const session = await signIn()

        const response = await patch('/users/me', session, {
          avatarKey: 'project-cover/01920000-0000-7000-8000-000000000001.png',
        })

        expect(response.statusCode).toBe(422)
        expect(response.json()).toMatchObject({ code: 'AUTH_AVATAR_NOT_ALLOWED' })
      })
    })
  })

  describe('PATCH /users/me/handle', () => {
    it('frees the old handle immediately, for anyone to take (AUTH-6)', async () => {
      const session = await signIn()

      const changed = await patch('/users/me/handle', session, { handle: 'ada_l' })
      expect(auth.publicProfileSchema.parse(changed.json()).handle).toBe('ada_l')

      // the freed handle is claimable at once, and nothing redirects from it
      expect((await app.inject({ method: 'GET', url: '/users/by-handle/ada' })).statusCode).toBe(
        404,
      )

      const other = await signIn({ providerUserId: 'bob-1', email: 'bob@example.com' })
      const claimed = await patch('/users/me/handle', other, { handle: 'ada' })
      expect(auth.publicProfileSchema.parse(claimed.json()).handle).toBe('ada')
    })

    it('refuses one another account holds, and leaves the row untouched', async () => {
      const session = await signIn()
      await signIn({ providerUserId: 'bob-1', email: 'bob@example.com', username: 'bob' })

      const response = await patch('/users/me/handle', session, { handle: 'bob' })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'AUTH_HANDLE_TAKEN' })
      const rows = await db.execute<{ handle: string }>(
        sql`select handle from users where display_name = 'Ada Lovelace' order by created_at limit 1`,
      )
      expect(rows.rows[0]?.handle).toBe('ada')
    })

    it('refuses a reserved handle', async () => {
      const session = await signIn()

      const response = await patch('/users/me/handle', session, { handle: 'settings' })

      expect(response.statusCode).toBe(422)
    })
  })
})
