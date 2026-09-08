import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { feedback as contract } from '@repo/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
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
import { HTTP_PROBE, JOB_SCHEDULER, type JobScheduler } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { SLOT_RELEASE_JOB } from '../application/claim-slot.use-case'
import {
  AUTO_ACCEPT_AFTER_MS,
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  WARN_AFTER_MS,
} from '../application/submit-feedback.use-case'
import { FeedbackModule } from '../feedback.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

type Scheduled = { name: string; data: object; runAt?: Date }

describe('feedback reports, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let scheduled: Scheduled[]
  let cancelled: string[]

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
      .overrideProvider(JOB_SCHEDULER)
      .useValue({
        // recorded rather than run: what matters is which timers were set and when
        enqueue: async (name: string, data: object) => {
          scheduled.push({ name, data })
        },
        schedule: async (name: string, data: object, runAt: Date) => {
          scheduled.push({ name, data, runAt })
        },
        cancel: async (name: string) => {
          cancelled.push(name)
        },
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
    probe.probed.length = 0
    scheduled = []
    cancelled = []
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

  /** A held slot on a real mission, which is where every case here starts. */
  async function heldSlot(questions: string[] = []): Promise<{
    maker: string
    feedbacker: string
    missionId: string
    claimId: string
  }> {
    const maker = await signIn('ada-1', 'ada')
    const created = await app.inject({
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
    const projectId = (created.json() as { id: string }).id

    const mission = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots: 2, questions },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const missionId = (mission.json() as { id: string }).id

    const feedbacker = await signIn('bob-1', 'bob')
    const claim = await app.inject({
      method: 'POST',
      url: `/missions/${missionId}/claims`,
      cookies: { [SESSION_COOKIE]: feedbacker },
    })

    return { maker, feedbacker, missionId, claimId: (claim.json() as { id: string }).id }
  }

  function report(overrides: Record<string, unknown> = {}) {
    return {
      firstImpression: `${ENOUGH} — first impression`,
      stuckAt: `${ENOUGH} — where I got stuck`,
      wouldPay: true,
      wouldPayReason: `${ENOUGH} — why I would pay`,
      suggestion: `${ENOUGH} — one suggestion`,
      answers: [],
      ...overrides,
    }
  }

  function submit(session: string, claimId: string, body: object) {
    return app.inject({
      method: 'POST',
      url: `/claims/${claimId}/feedback`,
      payload: body,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  describe('POST /claims/:id/feedback (FDBK-3)', () => {
    it('writes the report, flips the slot and starts both timers', async () => {
      const { feedbacker, claimId } = await heldSlot()

      const response = await submit(feedbacker, claimId, report())

      expect(response.statusCode).toBe(201)
      const written = contract.feedbackSchema.parse(response.json())
      expect(written.state).toBe('pending')
      expect(written.author?.handle).toBe('bob')

      const claim = await db.execute<{ state: string }>(
        sql`select state from feedback_claims where id = ${claimId}`,
      )
      expect(claim.rows[0]?.state).toBe('submitted')

      // the slot is spoken for, so nothing should hand it back
      expect(cancelled).toContain(SLOT_RELEASE_JOB)

      const submittedAt = new Date(written.submittedAt).getTime()
      const warn = scheduled.find((job) => job.name === FEEDBACK_WARN_JOB)
      const auto = scheduled.find((job) => job.name === FEEDBACK_AUTO_ACCEPT_JOB)
      expect(warn?.runAt?.getTime()).toBe(submittedAt + WARN_AFTER_MS)
      expect(auto?.runAt?.getTime()).toBe(submittedAt + AUTO_ACCEPT_AFTER_MS)
    })

    it('writes exactly one report per slot', async () => {
      const { feedbacker, claimId } = await heldSlot()
      await submit(feedbacker, claimId, report())

      const again = await submit(feedbacker, claimId, report())

      expect(again.statusCode).toBe(409)
      const rows = await db.execute<{ total: string }>(
        sql`select count(*)::text as total from feedbacks where claim_id = ${claimId}`,
      )
      expect(rows.rows[0]?.total).toBe('1')
    })

    it('takes one answer per mission question, in order', async () => {
      const { feedbacker, claimId } = await heldSlot(['Was it clear?', 'Would you use it?'])

      const response = await submit(
        feedbacker,
        claimId,
        report({ answers: [`${ENOUGH} — yes it was`, `${ENOUGH} — probably`] }),
      )

      expect(response.statusCode).toBe(201)
      expect(contract.feedbackSchema.parse(response.json()).answers).toEqual([
        `${ENOUGH} — yes it was`,
        `${ENOUGH} — probably`,
      ])
    })

    it('refuses a report missing an answer, naming what is wrong (FDBK-10)', async () => {
      const { feedbacker, claimId } = await heldSlot(['Was it clear?'])

      const response = await submit(feedbacker, claimId, report({ answers: [] }))

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
    })

    it('refuses a field one character short', async () => {
      const { feedbacker, claimId } = await heldSlot()

      const response = await submit(feedbacker, claimId, report({ stuckAt: 'a'.repeat(19) }))

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { stuckAt: expect.any(Array) },
      })
    })

    it('refuses somebody who does not hold the slot', async () => {
      const { claimId } = await heldSlot()
      const stranger = await signIn('cara-1', 'cara')

      const response = await submit(stranger, claimId, report())

      expect(response.statusCode).toBe(403)
    })

    it('refuses a hold that ran out', async () => {
      const { feedbacker, claimId } = await heldSlot()
      await db.execute(sql`
        update feedback_claims set held_until = now() - interval '1 minute' where id = ${claimId}
      `)

      const response = await submit(feedbacker, claimId, report())

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'CLAIM_EXPIRED' })
    })

    it('is 401 without a session', async () => {
      const { claimId } = await heldSlot()

      const response = await app.inject({
        method: 'POST',
        url: `/claims/${claimId}/feedback`,
        payload: report(),
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('reading a report (FDBK-9)', () => {
    it('is public, with no session at all', async () => {
      const { feedbacker, claimId } = await heldSlot()
      const written = contract.feedbackSchema.parse(
        (await submit(feedbacker, claimId, report())).json(),
      )

      const response = await app.inject({ method: 'GET', url: `/feedbacks/${written.id}` })

      expect(response.statusCode).toBe(200)
      expect(contract.feedbackSchema.parse(response.json()).id).toBe(written.id)
    })

    it('shows a rejected report with the reason it was given', async () => {
      const { feedbacker, claimId } = await heldSlot()
      const written = contract.feedbackSchema.parse(
        (await submit(feedbacker, claimId, report())).json(),
      )
      // T027 owns the settle endpoint; the row is what the read has to render
      await db.execute(sql`
        update feedbacks
        set state = 'rejected', rejection_reason = 'no_substance', rejection_note = 'too thin',
            settled_at = now()
        where id = ${written.id}
      `)

      const response = await app.inject({ method: 'GET', url: `/feedbacks/${written.id}` })

      const body = contract.feedbackSchema.parse(response.json())
      expect(body.state).toBe('rejected')
      expect(body.rejectionReason).toBe('no_substance')
      expect(body.rejectionNote).toBe('too thin')
    })

    it('renders an anonymised author as null rather than failing (AUTH-9)', async () => {
      const { feedbacker, claimId } = await heldSlot()
      const written = contract.feedbackSchema.parse(
        (await submit(feedbacker, claimId, report())).json(),
      )
      await db.execute(sql`update feedbacks set author_id = null where id = ${written.id}`)

      const response = await app.inject({ method: 'GET', url: `/feedbacks/${written.id}` })

      expect(response.statusCode).toBe(200)
      expect(contract.feedbackSchema.parse(response.json()).author).toBeNull()
    })

    it('is 404 for a report nobody wrote', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/feedbacks/01920000-0000-7000-8000-0000000000ff',
      })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'FEEDBACK_NOT_FOUND' })
    })

    it('lists what a mission has received', async () => {
      const { feedbacker, claimId, missionId } = await heldSlot()
      await submit(feedbacker, claimId, report())

      const response = await app.inject({ method: 'GET', url: `/missions/${missionId}/feedbacks` })

      expect(response.statusCode).toBe(200)
      expect(z.array(contract.feedbackSchema).parse(response.json())).toHaveLength(1)
    })
  })
})
