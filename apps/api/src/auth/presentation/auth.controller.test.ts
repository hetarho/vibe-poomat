import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPlugins } from '../../bootstrap'
import { ENV } from '../../shared/config/env.token'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { fakeEnv } from '../../test-support/fake-env'
import { GetMyProfileUseCase } from '../application/get-my-profile.use-case'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  ProviderExchangeFailedError,
  type ProviderProfile,
} from '../application/oauth-provider'
import { SignInWithProviderUseCase } from '../application/sign-in-with-provider.use-case'
import { SignOutUseCase } from '../application/sign-out.use-case'
import { SessionId } from '../domain/session-id'
import { FakeFileStorage } from '../test-support/fake-file-storage'
import {
  InMemoryIdentityRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  passthroughTransactions,
  StubSessionIdGenerator,
} from '../test-support/in-memory-repositories'
import { AuthController } from './auth.controller'
import { OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, SESSION_COOKIE } from './auth-cookies'

const WEB_URL = 'https://web.test'
const STATE = 'the-state'
const ISSUED_SESSION = SessionId.parse('a'.repeat(43))._unsafeUnwrap()

const profile: ProviderProfile = {
  provider: 'github',
  providerUserId: '4242',
  email: 'ada@example.com',
  emailVerified: true,
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  username: 'ada',
}

describe('the OAuth endpoints', () => {
  let app: NestFastifyApplication
  let users: InMemoryUserRepository
  let identities: InMemoryIdentityRepository
  let sessions: InMemorySessionRepository
  let fetchProfile: ReturnType<typeof vi.fn>

  function cookiesOf(headers: Record<string, unknown>): Record<string, string> {
    const raw = headers['set-cookie']
    const all = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : []

    return Object.fromEntries(all.map((cookie) => [cookie.slice(0, cookie.indexOf('=')), cookie]))
  }

  beforeEach(async () => {
    users = new InMemoryUserRepository()
    identities = new InMemoryIdentityRepository()
    sessions = new InMemorySessionRepository()
    fetchProfile = vi.fn(async () => ({ isErr: () => false, isOk: () => true, value: profile }))

    const client: OAuthProviderClient = {
      createAuthorization: () => ({
        url: 'https://github.com/login/oauth/authorize?state=the-state',
        state: STATE,
        codeVerifier: 'the-verifier',
      }),
      fetchProfile: fetchProfile as unknown as OAuthProviderClient['fetchProfile'],
    }
    const registry: OAuthProviderRegistry = {
      clientFor: () => ({ isErr: () => false, isOk: () => true, value: client }) as never,
    }

    const moduleRef = await Test.createTestingModule({
      imports: [PresentationModule],
      controllers: [AuthController],
      providers: [
        { provide: ENV, useValue: fakeEnv({ WEB_URL }) },
        { provide: OAUTH_PROVIDERS, useValue: registry },
        {
          provide: SignInWithProviderUseCase,
          useValue: new SignInWithProviderUseCase(
            users,
            identities,
            sessions,
            new StubSessionIdGenerator([ISSUED_SESSION]),
            passthroughTransactions,
          ),
        },
        {
          provide: GetMyProfileUseCase,
          useValue: new GetMyProfileUseCase(users, identities, new FakeFileStorage()),
        },
        { provide: SignOutUseCase, useValue: new SignOutUseCase(sessions) },
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
  })

  describe('GET /auth/:provider', () => {
    it('redirects to the provider and remembers the state and verifier', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/github' })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toContain('github.com/login/oauth/authorize')

      const cookies = cookiesOf(response.headers as Record<string, unknown>)
      expect(cookies[OAUTH_STATE_COOKIE]).toContain(`${OAUTH_STATE_COOKIE}=${STATE}`)
      expect(cookies[OAUTH_STATE_COOKIE]).toContain('HttpOnly')
      expect(cookies[OAUTH_STATE_COOKIE]).toContain('Secure')
      expect(cookies[OAUTH_STATE_COOKIE]).toContain('SameSite=Lax')
      expect(cookies[OAUTH_STATE_COOKIE]).toContain('Path=/api/v1/auth')
      expect(cookies[OAUTH_VERIFIER_COOKIE]).toContain('the-verifier')
    })

    it('keeps a same-site returnTo and drops one pointing elsewhere', async () => {
      const kept = await app.inject({ method: 'GET', url: '/auth/github?returnTo=/projects/42' })
      expect(cookiesOf(kept.headers as Record<string, unknown>).oauth_return_to).toContain(
        '/projects/42',
      )

      const dropped = await app.inject({
        method: 'GET',
        url: `/auth/github?returnTo=${encodeURIComponent('https://evil.test')}`,
      })
      const cookie = cookiesOf(dropped.headers as Record<string, unknown>).oauth_return_to ?? ''
      expect(cookie.startsWith('oauth_return_to=/;')).toBe(true)
    })

    it('sends an unknown provider to the sign-in page with a code', async () => {
      const response = await app.inject({ method: 'GET', url: '/auth/facebook' })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(`${WEB_URL}/sign-in?error=AUTH_UNKNOWN_PROVIDER`)
    })
  })

  describe('GET /auth/:provider/callback', () => {
    async function callback(query: string, cookies: Record<string, string>) {
      return app.inject({ method: 'GET', url: `/auth/github/callback${query}`, cookies })
    }

    it('signs the person in and sets the session cookie exactly as specified', async () => {
      const response = await callback(`?code=the-code&state=${STATE}`, {
        [OAUTH_STATE_COOKIE]: STATE,
        [OAUTH_VERIFIER_COOKIE]: 'the-verifier',
        oauth_return_to: '/projects/42',
      })

      expect(response.statusCode).toBe(302)
      expect(response.headers.location).toBe(`${WEB_URL}/projects/42`)

      const session = cookiesOf(response.headers as Record<string, unknown>)[SESSION_COOKIE] ?? ''
      expect(session).toContain(`${SESSION_COOKIE}=${ISSUED_SESSION.value}`)
      expect(session).toContain('HttpOnly')
      expect(session).toContain('Secure')
      expect(session).toContain('SameSite=Lax')
      expect(session).toContain('Path=/')
      expect(session).toContain('Max-Age=2592000')
      expect(users.rows.size).toBe(1)
    })

    it('clears the round-trip cookies whatever the outcome', async () => {
      const response = await callback(`?code=the-code&state=${STATE}`, {
        [OAUTH_STATE_COOKIE]: STATE,
        [OAUTH_VERIFIER_COOKIE]: 'the-verifier',
      })

      const cookies = cookiesOf(response.headers as Record<string, unknown>)
      expect(cookies[OAUTH_STATE_COOKIE]).toContain('Max-Age=0')
      expect(cookies[OAUTH_VERIFIER_COOKIE]).toContain('Max-Age=0')
    })

    it('refuses a state the browser never received, and creates nobody', async () => {
      const response = await callback('?code=the-code&state=forged', {
        [OAUTH_STATE_COOKIE]: STATE,
      })

      expect(response.headers.location).toBe(`${WEB_URL}/sign-in?error=AUTH_STATE_MISMATCH`)
      expect(fetchProfile).not.toHaveBeenCalled()
      expect(users.rows.size).toBe(0)
    })

    it('refuses a callback carrying no state cookie at all', async () => {
      const response = await callback(`?code=the-code&state=${STATE}`, {})

      expect(response.headers.location).toBe(`${WEB_URL}/sign-in?error=AUTH_STATE_MISMATCH`)
      expect(users.rows.size).toBe(0)
    })

    it('passes a refused consent through as its own code', async () => {
      const response = await callback(`?error=access_denied&state=${STATE}`, {
        [OAUTH_STATE_COOKIE]: STATE,
      })

      expect(response.headers.location).toBe(`${WEB_URL}/sign-in?error=AUTH_PROVIDER_DENIED`)
      expect(users.rows.size).toBe(0)
    })

    it('reports a failed code exchange and creates nobody', async () => {
      fetchProfile.mockResolvedValueOnce({
        isErr: () => true,
        isOk: () => false,
        error: new ProviderExchangeFailedError('nope'),
      })

      const response = await callback(`?code=stale&state=${STATE}`, {
        [OAUTH_STATE_COOKIE]: STATE,
      })

      expect(response.headers.location).toBe(
        `${WEB_URL}/sign-in?error=AUTH_PROVIDER_EXCHANGE_FAILED`,
      )
      expect(users.rows.size).toBe(0)
    })

    it('reports a callback with a state but no code', async () => {
      const response = await callback(`?state=${STATE}`, { [OAUTH_STATE_COOKIE]: STATE })

      expect(response.headers.location).toBe(
        `${WEB_URL}/sign-in?error=AUTH_PROVIDER_EXCHANGE_FAILED`,
      )
      expect(users.rows.size).toBe(0)
    })
  })
})
