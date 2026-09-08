import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { credits as contract } from '@repo/contracts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../../auth/application/oauth-provider'
import { AuthModule } from '../../auth/auth.module'
import { OAUTH_STATE_COOKIE, SESSION_COOKIE } from '../../auth/presentation/auth-cookies'
import { registerPlugins } from '../../bootstrap'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { CreditLedgerService } from '../application/credit-ledger.service'
import { CreditModule } from '../credit.module'
import { SEED_CREDITS } from '../domain/ledger-entry'

const STATE = 'the-state'

let nextProfile: ProviderProfile

const client: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(client) }

/**
 * The seed grant end to end: signing in for the first time is the only thing
 * that creates credits (CRED-2), and the owner is the only one who sees the log.
 */
describe('GET /credits/me', () => {
  let app: NestFastifyApplication
  let ledger: CreditLedgerService

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
        CreditModule,
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

    ledger = moduleRef.get(CreditLedgerService)
  })

  afterAll(async () => {
    await app.close()
  })

  async function signIn(providerUserId = '4242', email = 'ada@example.com'): Promise<string> {
    nextProfile = {
      provider: 'github',
      providerUserId,
      email,
      emailVerified: true,
      displayName: 'Ada Lovelace',
      avatarUrl: null,
      username: `ada${providerUserId}`,
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

  function fetchMine(session: string, query = '') {
    return app.inject({
      method: 'GET',
      url: `/credits/me${query}`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  it('shows the seed grant signing up earned, and the entry that made it', async () => {
    const session = await signIn()

    const response = await fetchMine(session)

    expect(response.statusCode).toBe(200)
    const body = contract.myCreditsSchema.parse(response.json())
    expect(body).toMatchObject({ balance: SEED_CREDITS, escrowed: 0, received: 0, given: 0 })
    expect(body.ledger.items.map((entry) => entry.type)).toEqual(['seed'])
    expect(body.ledger.nextCursor).toBeNull()
  })

  it('grants it exactly once, however many times that account signs in', async () => {
    const session = await signIn()
    await signIn()

    const body = contract.myCreditsSchema.parse((await fetchMine(session)).json())

    expect(body.balance).toBe(SEED_CREDITS)
    expect(body.ledger.items).toHaveLength(1)
  })

  it('shows escrow as escrowed rather than spent', async () => {
    const session = await signIn()
    const body = contract.myCreditsSchema.parse((await fetchMine(session)).json())
    const accountId = await accountBehind(session)
    await ledger.escrowForMission({
      accountId,
      missionId: '01920000-0000-7000-8000-0000000000c1',
      credits: 1,
    })

    const after = contract.myCreditsSchema.parse((await fetchMine(session)).json())

    expect(body.balance).toBe(SEED_CREDITS)
    expect(after).toMatchObject({ balance: SEED_CREDITS - 1, escrowed: 1 })
    expect(after.ledger.items.map((entry) => entry.type)).toEqual(['escrow', 'seed'])
  })

  it('is 401 without a session, because a ledger is nobody else’s business', async () => {
    const response = await app.inject({ method: 'GET', url: '/credits/me' })

    expect(response.statusCode).toBe(401)
  })

  /** The account id is not on the credits response, so it comes from /auth/me. */
  async function accountBehind(session: string): Promise<string> {
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE]: session },
    })

    return (me.json() as { id: string }).id
  }
})
