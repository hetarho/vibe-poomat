import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../application/oauth-provider'
import { AuthModule } from '../auth.module'
import { AccountCreated } from '../domain/account-created.event'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from './auth-cookies'

const STATE = 'the-state'

/**
 * The whole callback against a real PostgreSQL, with only the provider replaced:
 * everything between the redirect coming back and the rows landing is the code
 * that runs in production, transaction and post-commit dispatch included.
 */
let nextProfile: ProviderProfile

const client: OAuthProviderClient = {
  createAuthorization: () => ({
    url: 'https://provider.test/authorize',
    state: STATE,
    codeVerifier: null,
  }),
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
    username: 'Ada-Lovelace',
    ...overrides,
  }
}

describe('the OAuth callback, end to end', () => {
  let app: NestFastifyApplication
  let db: Db
  let created: AccountCreated[]

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, PresentationModule, HealthModule, EventsModule, DbModule, AuthModule],
    })
      .overrideProvider(OAUTH_PROVIDERS)
      .useValue(registry)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    db = moduleRef.get<Db>(DB)
    created = []
    moduleRef.get(DomainEventRegistry).register({
      eventName: 'auth.account-created',
      handle: async (event) => {
        created.push(event as AccountCreated)
      },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    created = []
    nextProfile = profile()
  })

  async function callback(cookies: Record<string, string> = {}) {
    return app.inject({
      method: 'GET',
      url: `/auth/github/callback?code=the-code&state=${STATE}`,
      cookies: { [OAUTH_STATE_COOKIE]: STATE, ...cookies },
    })
  }

  function sessionCookieValue(headers: Record<string, unknown>): string {
    const raw = headers['set-cookie']
    const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
    const cookie = all.find((candidate) => candidate.startsWith(`${SESSION_COOKIE}=`)) ?? ''

    return cookie.slice(`${SESSION_COOKIE}=`.length, cookie.indexOf(';'))
  }

  async function countOf(table: string): Promise<number> {
    const result = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from ${sql.identifier(table)}`,
    )

    return Number(result.rows[0]?.count ?? '0')
  }

  it('writes the user, the identity and the session, and sets the cookie', async () => {
    const response = await callback()

    expect(response.statusCode).toBe(302)
    expect(response.headers.location).toMatch(/\/$/)
    expect(await countOf('users')).toBe(1)
    expect(await countOf('identities')).toBe(1)
    expect(await countOf('sessions')).toBe(1)

    const rows = await db.execute<{ id: string; handle: string; display_name: string }>(
      sql`select id, handle, display_name from users`,
    )
    expect(rows.rows[0]?.handle).toBe('adalovelace')
    expect(rows.rows[0]?.display_name).toBe('Ada Lovelace')

    const issued = sessionCookieValue(response.headers as Record<string, unknown>)
    const sessions = await db.execute<{ user_id: string }>(
      sql`select user_id from sessions where id = ${issued}`,
    )
    expect(sessions.rows[0]?.user_id).toBe(rows.rows[0]?.id)
  })

  it('dispatches AccountCreated once the transaction has committed (ARCH-39)', async () => {
    await callback()

    expect(created).toHaveLength(1)
    expect(created[0]?.handle).toBe('adalovelace')
    // the handler ran after the commit, so the row it names is already there
    const rows = await db.execute<{ id: string }>(
      sql`select id from users where id = ${created[0]?.userId.value ?? ''}`,
    )
    expect(rows.rows).toHaveLength(1)
  })

  it('attaches the other provider to the same account on a matching verified email (AUTH-5)', async () => {
    await callback()
    created = []

    nextProfile = profile({
      provider: 'google',
      providerUserId: 'google-1',
      email: 'ADA@example.com',
      username: 'ada',
    })
    const response = await callback()

    expect(response.statusCode).toBe(302)
    expect(await countOf('users')).toBe(1)
    expect(await countOf('identities')).toBe(2)
    expect(created).toHaveLength(0)
  })

  it('starts a separate account when the second provider email is unverified', async () => {
    await callback()

    nextProfile = profile({
      provider: 'google',
      providerUserId: 'google-1',
      emailVerified: false,
      username: 'ada',
    })
    await callback()

    expect(await countOf('users')).toBe(2)
    expect(await countOf('identities')).toBe(2)
  })

  it('rotates the session the browser arrived with', async () => {
    const first = await callback()
    const firstId = sessionCookieValue(first.headers as Record<string, unknown>)

    const second = await callback({ [SESSION_COOKIE]: firstId })
    const secondId = sessionCookieValue(second.headers as Record<string, unknown>)

    expect(secondId).not.toBe(firstId)
    expect(await countOf('sessions')).toBe(1)
    const remaining = await db.execute<{ id: string }>(sql`select id from sessions`)
    expect(remaining.rows[0]?.id).toBe(secondId)
  })

  it('walks the handle past an account that already holds the provider username (AUTH-6)', async () => {
    await db.execute(sql`
      insert into users (id, handle, display_name, created_at, updated_at)
      values ('01920000-0000-7000-8000-000000000001', 'adalovelace', 'Squatter', now(), now())
    `)

    const response = await callback()

    expect(response.statusCode).toBe(302)
    const rows = await db.execute<{ handle: string }>(
      sql`select handle from users where display_name = 'Ada Lovelace'`,
    )
    expect(rows.rows[0]?.handle).toBe('adalovelace2')
  })

  it('rolls the whole sign-in back when the use case fails (ARCH-38)', async () => {
    // an identity pointing at an account that is gone: the callback recognises
    // the provider account, then finds nothing to sign in as
    await db.execute(sql`
      insert into identities
        (id, user_id, provider, provider_user_id, email, email_verified, created_at, updated_at)
      values
        ('01920000-0000-7000-8000-000000000002', '01920000-0000-7000-8000-000000000003',
         'github', '4242', 'ada@example.com', true, now(), now())
    `)

    const response = await callback()

    expect(response.headers.location).toContain('error=NOT_FOUND')
    expect(await countOf('users')).toBe(0)
    expect(await countOf('sessions')).toBe(0)
    expect(await countOf('identities')).toBe(1)
    expect(created).toHaveLength(0)
  })
})
