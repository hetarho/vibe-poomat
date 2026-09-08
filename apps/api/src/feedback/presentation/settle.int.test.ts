import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { feedback as contract, projects as projectContract } from '@repo/contracts'
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
import { CreditLedgerService } from '../../credit/application/credit-ledger.service'
import { CreditModule } from '../../credit/credit.module'
import { CREDIT_LEDGER, type CreditLedger } from '../../credit/domain/credit-ledger.repository'
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
import { HTTP_PROBE, TRANSACTION_MANAGER, type TransactionManager } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { CROSS_CONTEXT_EVENTS } from '../../shared/kernel'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import { FeedbackModule } from '../feedback.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count for anything'
const SEED_CREDITS = 2

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

/**
 * The settlement end to end: a real report, a real ledger, a real mission. What
 * matters here is that exactly one credit moves, in the right direction, once.
 */
describe('settling feedback, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let credits: CreditLedgerService
  let ledger: CreditLedger
  let transactions: TransactionManager
  let settlement: SettleFeedbackUseCase
  let warned: string[]

  beforeAll(async () => {
    probe = new StubHttpProbe()

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
        ProjectModule,
        FeedbackModule,
      ],
    })
      .overrideProvider(OAUTH_PROVIDERS)
      .useValue(registry)
      .overrideProvider(HTTP_PROBE)
      .useValue(probe)
      .compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await registerPlugins(app)
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    db = moduleRef.get<Db>(DB)
    credits = moduleRef.get(CreditLedgerService)
    ledger = moduleRef.get<CreditLedger>(CREDIT_LEDGER)
    transactions = moduleRef.get<TransactionManager>(TRANSACTION_MANAGER)
    settlement = moduleRef.get(SettleFeedbackUseCase)

    warned = []
    moduleRef.get(DomainEventRegistry).register({
      eventName: CROSS_CONTEXT_EVENTS.autoAcceptWarning,
      handle: async (event) => {
        warned.push(event.aggregateId.value)
      },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
    warned = []
  })

  async function signIn(providerUserId: string, username: string): Promise<string> {
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

  async function accountBehind(session: string): Promise<string> {
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE]: session },
    })

    return (me.json() as { id: string }).id
  }

  /** A submitted report, which every case here starts from. */
  async function pendingReport(slots = 1): Promise<{
    maker: string
    makerId: string
    feedbacker: string
    feedbackerId: string
    missionId: string
    feedbackId: string
  }> {
    const maker = await signIn('ada-1', 'ada')
    const makerId = await accountBehind(maker)
    const project = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        title: 'Poomat',
        liveUrl: 'https://poomat.test',
        pitch: 'Trade real feedback',
        tags: ['SaaS'],
      },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const projectId = (project.json() as { id: string }).id

    const mission = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const missionId = (mission.json() as { id: string }).id

    const feedbacker = await signIn('bob-1', 'bob')
    const feedbackerId = await accountBehind(feedbacker)
    const claim = await app.inject({
      method: 'POST',
      url: `/missions/${missionId}/claims`,
      cookies: { [SESSION_COOKIE]: feedbacker },
    })
    const claimId = (claim.json() as { id: string }).id

    const submitted = await app.inject({
      method: 'POST',
      url: `/claims/${claimId}/feedback`,
      payload: {
        firstImpression: `${ENOUGH} — first`,
        stuckAt: `${ENOUGH} — stuck`,
        wouldPay: true,
        wouldPayReason: `${ENOUGH} — why`,
        suggestion: `${ENOUGH} — do this`,
        answers: [],
      },
      cookies: { [SESSION_COOKIE]: feedbacker },
    })

    return {
      maker,
      makerId,
      feedbacker,
      feedbackerId,
      missionId,
      feedbackId: (submitted.json() as { id: string }).id,
    }
  }

  function settle(session: string, feedbackId: string, how: 'accept' | 'reject', body?: object) {
    return app.inject({
      method: 'POST',
      url: `/feedbacks/${feedbackId}/${how}`,
      ...(body === undefined ? {} : { payload: body }),
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  /** The cached figures must always equal what the log alone says (CRED-6). */
  async function expectLedgerHolds(accountId: string): Promise<void> {
    const [state, recomputed] = await Promise.all([
      credits.stateOf(accountId),
      transactions.run(async () => ledger.recompute(accountId)),
    ])

    expect({
      balance: state.balance,
      escrowed: state.escrowed,
      received: state.received,
      given: state.given,
    }).toEqual(recomputed)
  }

  describe('POST /feedbacks/:id/accept (FDBK-6, CRED-4)', () => {
    it('pays the feedbacker exactly one credit out of the escrow', async () => {
      const { maker, makerId, feedbackerId, feedbackId } = await pendingReport()

      const response = await settle(maker, feedbackId, 'accept')

      expect(response.statusCode).toBe(200)
      const settled = contract.feedbackSchema.parse(response.json())
      expect(settled.state).toBe('accepted')
      expect(settled.automatic).toBe(false)

      expect(await credits.stateOf(makerId)).toMatchObject({ escrowed: 0, given: 1 })
      expect(await credits.stateOf(feedbackerId)).toMatchObject({
        balance: SEED_CREDITS + 1,
        received: 1,
      })
      await expectLedgerHolds(makerId)
      await expectLedgerHolds(feedbackerId)
    })

    it('completes the mission when it was the last outstanding slot (PROJ-6)', async () => {
      const { maker, missionId, feedbackId } = await pendingReport(1)

      await settle(maker, feedbackId, 'accept')

      const rows = await db.execute<{ state: string }>(
        sql`select state from missions where id = ${missionId}`,
      )
      expect(rows.rows[0]?.state).toBe('completed')
    })

    it('refuses somebody else the decision', async () => {
      const { feedbacker, feedbackId } = await pendingReport()

      const response = await settle(feedbacker, feedbackId, 'accept')

      expect(response.statusCode).toBe(403)
    })

    it('refuses a second settle and moves nothing', async () => {
      const { maker, makerId, feedbackerId, feedbackId } = await pendingReport()
      await settle(maker, feedbackId, 'accept')

      const again = await settle(maker, feedbackId, 'accept')

      expect(again.statusCode).toBe(409)
      expect(again.json()).toMatchObject({ code: 'FEEDBACK_ALREADY_SETTLED' })
      expect(await credits.stateOf(feedbackerId)).toMatchObject({ received: 1 })
      await expectLedgerHolds(makerId)
    })

    it('is 401 without a session', async () => {
      const { feedbackId } = await pendingReport()

      const response = await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/accept`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('POST /feedbacks/:id/reject (FDBK-6)', () => {
    it('returns the credit to the maker and keeps the reason public (FDBK-9)', async () => {
      const { maker, makerId, feedbackerId, feedbackId } = await pendingReport()

      const response = await settle(maker, feedbackId, 'reject', {
        reason: 'no_substance',
        note: 'nothing to act on',
      })

      expect(response.statusCode).toBe(200)
      // the seed was two, one went into escrow, and the rejection sent it back
      expect(await credits.stateOf(makerId)).toMatchObject({
        escrowed: 0,
        balance: SEED_CREDITS,
        given: 0,
      })
      expect(await credits.stateOf(feedbackerId)).toMatchObject({
        balance: SEED_CREDITS,
        received: 0,
      })

      const publicRead = await app.inject({ method: 'GET', url: `/feedbacks/${feedbackId}` })
      const body = contract.feedbackSchema.parse(publicRead.json())
      expect(body.state).toBe('rejected')
      expect(body.rejectionReason).toBe('no_substance')
      expect(body.rejectionNote).toBe('nothing to act on')
      await expectLedgerHolds(makerId)
    })

    it('takes a reason with no note at all', async () => {
      const { maker, feedbackId } = await pendingReport()

      const response = await settle(maker, feedbackId, 'reject', { reason: 'task_not_done' })

      expect(response.statusCode).toBe(200)
      expect(contract.feedbackSchema.parse(response.json()).rejectionNote).toBeNull()
    })

    it('refuses a reason outside the fixed list', async () => {
      const { maker, feedbackId } = await pendingReport()

      const response = await settle(maker, feedbackId, 'reject', { reason: 'i-did-not-like-it' })

      expect(response.statusCode).toBe(422)
    })
  })

  describe('the 72-hour auto-accept (FDBK-7)', () => {
    it('pays the feedbacker and says the clock decided', async () => {
      const { makerId, feedbackerId, feedbackId } = await pendingReport()

      expect((await settlement.autoAccept(feedbackId)).isOk()).toBe(true)

      const read = await app.inject({ method: 'GET', url: `/feedbacks/${feedbackId}` })
      const body = contract.feedbackSchema.parse(read.json())
      expect(body.state).toBe('accepted')
      expect(body.automatic).toBe(true)
      expect(await credits.stateOf(feedbackerId)).toMatchObject({ received: 1 })
      await expectLedgerHolds(makerId)
    })

    it('running it twice pays once', async () => {
      const { feedbackerId, feedbackId } = await pendingReport()
      await settlement.autoAccept(feedbackId)

      expect((await settlement.autoAccept(feedbackId)).isOk()).toBe(true)

      expect(await credits.stateOf(feedbackerId)).toMatchObject({
        balance: SEED_CREDITS + 1,
        received: 1,
      })
    })

    it('is a no-op once the maker has already answered', async () => {
      const { maker, makerId, feedbackId } = await pendingReport()
      await settle(maker, feedbackId, 'reject', { reason: 'task_not_done' })

      expect((await settlement.autoAccept(feedbackId)).isOk()).toBe(true)

      const read = await app.inject({ method: 'GET', url: `/feedbacks/${feedbackId}` })
      expect(contract.feedbackSchema.parse(read.json()).state).toBe('rejected')
      expect(await credits.stateOf(makerId)).toMatchObject({ balance: SEED_CREDITS })
    })
  })

  describe('the 48-hour warning (FDBK-7)', () => {
    it('announces it while the decision is still open', async () => {
      const { feedbackId } = await pendingReport()

      expect((await settlement.warn(feedbackId)).isOk()).toBe(true)

      expect(warned).toEqual([feedbackId])
    })

    it('says nothing once the report has been settled', async () => {
      const { maker, feedbackId } = await pendingReport()
      await settle(maker, feedbackId, 'accept')
      warned = []

      expect((await settlement.warn(feedbackId)).isOk()).toBe(true)

      expect(warned).toEqual([])
    })
  })

  describe('what the mission shows afterwards', () => {
    it('leaves a settled slot spent rather than back in the pool', async () => {
      const { maker, missionId, feedbackId } = await pendingReport(2)
      await settle(maker, feedbackId, 'accept')

      const project = await db.execute<{ project_id: string }>(
        sql`select project_id from missions where id = ${missionId}`,
      )
      const read = await app.inject({
        method: 'GET',
        url: `/projects/${project.rows[0]?.project_id}`,
      })

      expect(projectContract.projectSchema.parse(read.json()).activeMission).toMatchObject({
        slots: 2,
        openSlots: 1,
      })
    })
  })
})
