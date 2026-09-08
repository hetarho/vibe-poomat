import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { auth as authContract } from '@repo/contracts'
import { sql } from 'drizzle-orm'
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
import { CreditModule } from '../../credit/credit.module'
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
import { HTTP_PROBE, type MakerStats } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { REJECTION_REASONS, type RejectionReason } from '../../shared/kernel'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import { FeedbackModule } from '../feedback.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count for anything'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

/**
 * What happens to one report. `pending` has to come last in a maker's list: the
 * mission behind it stays open, and PROJ-5 allows a project only one of those.
 */
type Outcome = 'accept' | 'auto' | 'pending' | { reject: RejectionReason }

/**
 * FDBK-8 against a real PostgreSQL. The grouped aggregate is what is worth
 * proving here: it has to agree with a naive recount over the very same rows,
 * whatever mix of outcomes a maker has produced.
 *
 * Every credit here moves through the real ledger, so each maker's outcomes stay
 * inside the two credits CRED-1 seeds them: a rejection refunds and can be spent
 * again, an acceptance and a pending report cannot.
 */
describe('maker rejection stats, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let settlement: SettleFeedbackUseCase
  let helpers = 0

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
    settlement = moduleRef.get(SettleFeedbackUseCase)
  })

  afterAll(async () => {
    await app.close()
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

  async function me(session: string): Promise<{ id: string; handle: string }> {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE]: session },
    })

    return response.json() as { id: string; handle: string }
  }

  /**
   * Runs one report all the way to the outcome asked for. Each report gets its
   * own mission and its own feedbacker, because FDBK-2 gives one account at most
   * one live slot per mission.
   */
  async function report(maker: string, projectId: string, outcome: Outcome): Promise<void> {
    const mission = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots: 1 },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const missionId = (mission.json() as { id: string }).id

    helpers += 1
    const helper = await signIn(`helper${helpers}`, `helper${helpers}`)
    const claim = await app.inject({
      method: 'POST',
      url: `/missions/${missionId}/claims`,
      cookies: { [SESSION_COOKIE]: helper },
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
      cookies: { [SESSION_COOKIE]: helper },
    })
    const feedbackId = (submitted.json() as { id: string }).id

    if (outcome === 'pending') return
    if (outcome === 'auto') {
      expect((await settlement.autoAccept(feedbackId)).isOk()).toBe(true)

      return
    }

    const settled = await app.inject({
      method: 'POST',
      url: `/feedbacks/${feedbackId}/${outcome === 'accept' ? 'accept' : 'reject'}`,
      ...(outcome === 'accept' ? {} : { payload: { reason: outcome.reject } }),
      cookies: { [SESSION_COOKIE]: maker },
    })
    expect(settled.statusCode).toBe(200)
  }

  /** An account with one project, and the outcomes asked for run against it. */
  async function makerWith(
    tag: string,
    outcomes: Outcome[],
  ): Promise<{ session: string; id: string; handle: string }> {
    const session = await signIn(tag, tag)
    const account = await me(session)

    if (outcomes.length > 0) {
      const project = await app.inject({
        method: 'POST',
        url: '/projects',
        payload: {
          title: `Poomat ${tag}`,
          liveUrl: `https://${tag}.test`,
          pitch: 'Trade real feedback',
          tags: ['SaaS'],
        },
        cookies: { [SESSION_COOKIE]: session },
      })
      const projectId = (project.json() as { id: string }).id

      for (const outcome of outcomes) {
        await report(session, projectId, outcome)
      }
    }

    return { session, id: account.id, handle: account.handle }
  }

  /** The same numbers, counted the dumb way over the very same rows. */
  async function recount(makerId: string): Promise<MakerStats> {
    const { rows } = await db.execute<{ state: string; rejection_reason: string | null }>(
      sql`select state, rejection_reason from feedbacks where maker_id = ${makerId}`,
    )
    const settled = rows.filter((row) => row.state !== 'pending')
    const rejected = settled.filter((row) => row.state === 'rejected')

    return {
      settledCount: settled.length,
      rejectedCount: rejected.length,
      rejectionRate: settled.length === 0 ? null : rejected.length / settled.length,
      reasons: Object.fromEntries(
        REJECTION_REASONS.map((reason) => [
          reason,
          rejected.filter((row) => row.rejection_reason === reason).length,
        ]),
      ) as Record<RejectionReason, number>,
    }
  }

  async function statsOn(handle: string) {
    const response = await app.inject({ method: 'GET', url: `/users/by-handle/${handle}` })
    expect(response.statusCode).toBe(200)

    return authContract.publicProfileSchema.parse(response.json()).makerStats
  }

  describe('the block on a public profile (FDBK-8, AUTH-7)', () => {
    it('is there for anyone, with no session at all', async () => {
      const maker = await makerWith('adastats', [
        { reject: 'no_substance' },
        { reject: 'spam_abuse' },
        'accept',
        'pending',
      ])

      expect(await statsOn(maker.handle)).toEqual({
        settledCount: 3,
        rejectedCount: 2,
        rejectionRate: 2 / 3,
        reasons: { task_not_done: 0, no_substance: 1, spam_abuse: 1 },
      })
    })

    it('agrees with a naive recount over the same rows', async () => {
      const maker = await makerWith('beastats', [
        { reject: 'task_not_done' },
        'auto',
        { reject: 'no_substance' },
        'pending',
      ])

      expect(await statsOn(maker.handle)).toEqual(await recount(maker.id))
    })

    it('counts an auto-accepted report as accepted, never as a rejection (FDBK-7)', async () => {
      const maker = await makerWith('calstats', ['auto', 'auto'])

      expect(await statsOn(maker.handle)).toMatchObject({
        settledCount: 2,
        rejectedCount: 0,
        rejectionRate: 0,
      })
    })

    it('leaves a pending report out of both the numerator and the denominator', async () => {
      const maker = await makerWith('dotstats', ['pending'])

      expect(await statsOn(maker.handle)).toMatchObject({
        settledCount: 0,
        rejectedCount: 0,
        rejectionRate: null,
      })
    })

    it('says null rather than a spotless 0% for an account with no history', async () => {
      const newcomer = await makerWith('evestats', [])

      expect(await statsOn(newcomer.handle)).toEqual({
        settledCount: 0,
        rejectedCount: 0,
        rejectionRate: null,
        reasons: { task_not_done: 0, no_substance: 0, spam_abuse: 0 },
      })
    })
  })

  describe('the same block on the owner’s own view', () => {
    it('shows them exactly what everyone else sees', async () => {
      const maker = await makerWith('faystats', ['accept', { reject: 'spam_abuse' }])

      const mine = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: maker.session },
      })

      expect(authContract.meSchema.parse(mine.json()).makerStats).toEqual(
        await statsOn(maker.handle),
      )
    })
  })

  describe('whose reports it counts', () => {
    it('counts only the reports on this maker’s own projects', async () => {
      const gus = await makerWith('gusstats', [{ reject: 'no_substance' }])
      const hal = await makerWith('halstats', ['accept'])

      expect(await statsOn(gus.handle)).toMatchObject({ settledCount: 1, rejectionRate: 1 })
      expect(await statsOn(hal.handle)).toMatchObject({ settledCount: 1, rejectionRate: 0 })
    })

    /** A feedbacker is not a maker, however many reports they have written. */
    it('counts nothing for an account that has only ever given feedback', async () => {
      await makerWith('ivystats', ['accept', 'accept'])
      const helper = await me(await signIn(`helper${helpers}`, `helper${helpers}`))

      expect(await statsOn(helper.handle)).toMatchObject({
        settledCount: 0,
        rejectionRate: null,
      })
    })
  })

  describe('the row the aggregate reads', () => {
    it('carries the maker, so the count needs no reach into the project tables', async () => {
      const maker = await makerWith('janstats', ['accept'])

      const { rows } = await db.execute<{ maker_id: string; owner_id: string }>(sql`
        select f.maker_id, p.owner_id
        from feedbacks f join projects p on p.id = f.project_id
        where f.maker_id = ${maker.id}
      `)

      expect(rows).toHaveLength(1)
      expect(rows[0]?.maker_id).toBe(rows[0]?.owner_id)
    })

    it('is indexed by maker and state, which is what the aggregate filters on', async () => {
      const { rows } = await db.execute<{ indexdef: string }>(
        sql`select indexdef from pg_indexes
            where tablename = 'feedbacks' and indexname = 'feedbacks_maker_state_idx'`,
      )

      expect(rows[0]?.indexdef).toMatch(/\(maker_id, state\)/)
    })
  })
})
