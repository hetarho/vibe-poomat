import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { notifications as contract } from '@repo/contracts'
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
import { SettleFeedbackUseCase } from '../../feedback/application/settle-feedback.use-case'
import { FeedbackModule } from '../../feedback/feedback.module'
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
import {
  HTTP_PROBE,
  JOB_SCHEDULER,
  type JobScheduler,
  type MailRequest,
} from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { MailModule } from '../../shared/infrastructure/mail/mail.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { UnsubscribeToken } from '../application/unsubscribe-token'
import { NotificationModule } from '../notification.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count for anything'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

type QueuedMail = MailRequest & { props: Record<string, unknown> }

/**
 * The settle chain end to end, against a real PostgreSQL. What matters is which
 * emails are queued and to whom: NOTI-2 names one recipient per event, and an
 * auto-accept is the only one that reaches both sides.
 *
 * The queue is captured rather than drained, because ARCH-36's contract is that
 * the use case is finished the moment the job exists.
 */
describe('notifications, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let probe: StubHttpProbe
  let db: Db
  let tokens: UnsubscribeToken
  let settlement: SettleFeedbackUseCase
  let queued: { name: string; data: QueuedMail }[]
  let helpers = 0

  beforeAll(async () => {
    probe = new StubHttpProbe()
    queued = []

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule,
        PresentationModule,
        HealthModule,
        EventsModule,
        DbModule,
        JobsModule,
        MailModule,
        StorageModule,
        CreditModule,
        AuthModule,
        ProjectModule,
        FeedbackModule,
        NotificationModule,
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
    tokens = moduleRef.get(UnsubscribeToken)
    settlement = moduleRef.get(SettleFeedbackUseCase)

    // wrapped rather than replaced, so every other queue keeps working and the
    // real enqueue still runs inside the transaction it belongs to
    const scheduler = moduleRef.get<JobScheduler>(JOB_SCHEDULER)
    const original = scheduler.enqueue.bind(scheduler)
    scheduler.enqueue = async (name, data, options) => {
      queued.push({ name, data: data as QueuedMail })

      return original(name, data, options)
    }
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
    queued = []
  })

  function mails(): QueuedMail[] {
    return queued.filter((job) => job.name === 'email.send').map((job) => job.data)
  }

  function templatesSent(): string[] {
    return mails().map((mail) => mail.template)
  }

  /**
   * Settling the only slot also ends the mission (PROJ-6), so its own email
   * rides along with every decision. It has a test of its own; these assertions
   * are about who is told about the decision.
   */
  function decisionsSent(): string[] {
    return templatesSent().filter((template) => template !== 'mission_ended')
  }

  function decisionMails(): QueuedMail[] {
    return mails().filter((mail) => mail.template !== 'mission_ended')
  }

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

  /** A submitted report and both of its people. */
  async function pendingReport(tag: string): Promise<{
    maker: string
    makerId: string
    makerEmail: string
    feedbacker: string
    feedbackerId: string
    feedbackerEmail: string
    feedbackId: string
  }> {
    const maker = await signIn(`${tag}-maker`, `${tag}maker`)
    const makerId = await accountBehind(maker)
    const project = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        title: `Poomat ${tag}`,
        liveUrl: `https://${tag}.test`,
        pitch: 'Trade real feedback',
        tags: ['SaaS'],
      },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const projectId = (project.json() as { id: string }).id

    const mission = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots: 1 },
      cookies: { [SESSION_COOKIE]: maker },
    })
    const missionId = (mission.json() as { id: string }).id

    helpers += 1
    const feedbacker = await signIn(`helper${helpers}`, `helper${helpers}`)
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
      makerEmail: `${tag}maker@example.com`,
      feedbacker,
      feedbackerId,
      feedbackerEmail: `helper${helpers}@example.com`,
      feedbackId: (submitted.json() as { id: string }).id,
    }
  }

  describe('the settle chain (NOTI-2)', () => {
    it('tells the maker as soon as a report lands', async () => {
      const { makerEmail } = await pendingReport('submit')

      expect(templatesSent()).toContain('feedback_received')
      expect(mails().find((mail) => mail.template === 'feedback_received')?.to).toBe(makerEmail)
    })

    it('tells only the feedbacker when the maker accepts', async () => {
      const { maker, feedbackId, feedbackerEmail } = await pendingReport('accept')
      queued = []

      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/accept`,
        cookies: { [SESSION_COOKIE]: maker },
      })

      expect(decisionsSent()).toEqual(['feedback_accepted'])
      expect(decisionMails()[0]?.to).toBe(feedbackerEmail)
    })

    it('tells the feedbacker why when the maker rejects', async () => {
      const { maker, feedbackId, feedbackerEmail } = await pendingReport('reject')
      queued = []

      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/reject`,
        payload: { reason: 'no_substance', note: 'nothing to act on' },
        cookies: { [SESSION_COOKIE]: maker },
      })

      expect(decisionsSent()).toEqual(['feedback_rejected'])
      expect(decisionMails()[0]?.to).toBe(feedbackerEmail)
      expect(decisionMails()[0]?.props.reason).toBe('no_substance')
    })

    /** FDBK-7: the clock decided, so both people are told what happened to them. */
    it('tells both sides when the 72 hours run out', async () => {
      const { feedbackId, makerEmail, feedbackerEmail } = await pendingReport('auto')
      queued = []

      expect((await settlement.autoAccept(feedbackId)).isOk()).toBe(true)

      expect(decisionsSent()).toEqual(['auto_accepted', 'auto_accepted'])
      expect(decisionMails().map((mail) => mail.to)).toEqual([makerEmail, feedbackerEmail])
      expect(decisionMails().map((mail) => mail.props.role)).toEqual(['maker', 'feedbacker'])
    })

    it('tells the maker at 48 hours, and nobody else', async () => {
      const { feedbackId, makerEmail } = await pendingReport('warn')
      queued = []

      expect((await settlement.warn(feedbackId)).isOk()).toBe(true)

      expect(decisionsSent()).toEqual(['auto_accept_warning'])
      expect(decisionMails()[0]?.to).toBe(makerEmail)
      // NOTI-3: no link, because there is nothing to unsubscribe from
      expect(decisionMails()[0]?.props.unsubscribeUrl).toBeNull()
    })

    it('tells the other participant when a thread reply lands', async () => {
      const { maker, feedbackId, feedbackerEmail } = await pendingReport('thread')
      queued = []

      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/replies`,
        payload: { body: 'thanks — which browser?' },
        cookies: { [SESSION_COOKIE]: maker },
      })

      expect(decisionsSent()).toEqual(['thread_reply'])
      expect(decisionMails()[0]?.to).toBe(feedbackerEmail)
    })

    /** PROJ-6: the last slot settling ends the mission, which the maker is told about. */
    it('tells the maker when their mission ends, with the refund summary', async () => {
      const { maker, feedbackId, makerEmail } = await pendingReport('mission')
      queued = []

      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/accept`,
        cookies: { [SESSION_COOKIE]: maker },
      })

      const ended = mails().find((mail) => mail.template === 'mission_ended')
      expect(ended?.to).toBe(makerEmail)
      expect(ended?.props).toMatchObject({ ending: 'completed', refundedSlots: 0 })
    })
  })

  describe('a recipient who is no longer there (AUTH-9)', () => {
    /**
     * FDBK-7's timers fire hours later, by which time the account may be gone.
     * The handler must finish rather than fail: a job that throws is retried,
     * and retrying will never find the account again.
     */
    it('finishes cleanly and queues nothing when the account has been deleted', async () => {
      const { makerId, feedbackId } = await pendingReport('deleted')
      await db.execute(sql`delete from users where id = ${makerId}`)
      queued = []

      expect((await settlement.warn(feedbackId)).isOk()).toBe(true)

      expect(mails()).toEqual([])
    })
  })

  describe('GET/PATCH /notifications/preferences (NOTI-3)', () => {
    it('answers with every type before anybody has changed one', async () => {
      const session = await signIn('prefs-1', 'prefsone')

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/preferences',
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(200)
      const body = contract.notificationPreferencesSchema.parse(response.json())
      expect(body.items).toHaveLength(contract.NOTIFICATION_TYPES.length)
      expect(body.items.every((item) => item.enabled)).toBe(true)
    })

    it('is 401 without a session', async () => {
      const response = await app.inject({ method: 'GET', url: '/notifications/preferences' })

      expect(response.statusCode).toBe(401)
    })

    it('turns a type off and reads back off', async () => {
      const session = await signIn('prefs-2', 'prefstwo')

      const patched = await app.inject({
        method: 'PATCH',
        url: '/notifications/preferences',
        payload: { thread_reply: false },
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(patched.statusCode).toBe(200)
      const body = contract.notificationPreferencesSchema.parse(patched.json())
      expect(body.items.find((item) => item.type === 'thread_reply')?.enabled).toBe(false)
    })

    it('refuses to disable the warning, with 403 and a code the UI can read', async () => {
      const session = await signIn('prefs-3', 'prefsthree')

      const response = await app.inject({
        method: 'PATCH',
        url: '/notifications/preferences',
        payload: { auto_accept_warning: false },
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'NOTIFICATION_ALWAYS_ON' })
    })

    it('marks the warning as one that cannot be disabled', async () => {
      const session = await signIn('prefs-4', 'prefsfour')

      const response = await app.inject({
        method: 'GET',
        url: '/notifications/preferences',
        cookies: { [SESSION_COOKIE]: session },
      })

      const body = contract.notificationPreferencesSchema.parse(response.json())
      expect(body.items.filter((item) => !item.canDisable).map((item) => item.type)).toEqual([
        'auto_accept_warning',
      ])
    })

    it('stops the email once the type is off', async () => {
      const { maker, feedbackId } = await pendingReport('optout')
      await app.inject({
        method: 'PATCH',
        url: '/notifications/preferences',
        payload: { feedback_accepted: false },
        cookies: { [SESSION_COOKIE]: maker },
      })
      // the feedbacker is the one who would be told, so it is their setting
      const feedbackerSession = await signIn(`helper${helpers}`, `helper${helpers}`)
      await app.inject({
        method: 'PATCH',
        url: '/notifications/preferences',
        payload: { feedback_accepted: false },
        cookies: { [SESSION_COOKIE]: feedbackerSession },
      })
      queued = []

      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/accept`,
        cookies: { [SESSION_COOKIE]: maker },
      })

      expect(templatesSent()).not.toContain('feedback_accepted')
    })
  })

  describe('GET /notifications/unsubscribe (NOTI-4)', () => {
    it('turns the type off with no session, and lands on the settings page', async () => {
      const session = await signIn('unsub-1', 'unsubone')
      const userId = await accountBehind(session)

      const response = await app.inject({
        method: 'GET',
        url: `/notifications/unsubscribe?token=${encodeURIComponent(
          tokens.sign({ userId, type: 'thread_reply' }),
        )}`,
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toContain('/unsubscribe?type=thread_reply')

      const after = await app.inject({
        method: 'GET',
        url: '/notifications/preferences',
        cookies: { [SESSION_COOKIE]: session },
      })
      const body = contract.notificationPreferencesSchema.parse(after.json())
      expect(body.items.filter((item) => !item.enabled).map((item) => item.type)).toEqual([
        'thread_reply',
      ])
    })

    /**
     * A person clicked a link in a mail client, so a refusal is a page too — and
     * one that says what went wrong without saying whose account it was about.
     */
    it('refuses a tampered token, as a page rather than an error body', async () => {
      const session = await signIn('unsub-2', 'unsubtwo')
      const userId = await accountBehind(session)
      const token = tokens.sign({ userId, type: 'thread_reply' })

      const response = await app.inject({
        method: 'GET',
        url: `/notifications/unsubscribe?token=${encodeURIComponent(`${token}x`)}`,
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toContain(
        '/unsubscribe?error=UNSUBSCRIBE_TOKEN_NOT_ALLOWED',
      )
      expect(response.headers.location).not.toContain(userId)
      const after = await app.inject({
        method: 'GET',
        url: '/notifications/preferences',
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(
        contract.notificationPreferencesSchema
          .parse(after.json())
          .items.every((item) => item.enabled),
      ).toBe(true)
    })

    it('refuses a link for the type that cannot be switched off', async () => {
      const session = await signIn('unsub-3', 'unsubthree')
      const userId = await accountBehind(session)

      const response = await app.inject({
        method: 'GET',
        url: `/notifications/unsubscribe?token=${encodeURIComponent(
          tokens.sign({ userId, type: 'auto_accept_warning' }),
        )}`,
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toContain('/unsubscribe?error=NOTIFICATION_ALWAYS_ON')
      expect(response.headers.location).not.toContain(userId)
    })

    it('is the very link the emails carry', async () => {
      const { makerEmail } = await pendingReport('link')
      const received = mails().find((mail) => mail.template === 'feedback_received')
      expect(received?.to).toBe(makerEmail)

      const url = new URL(received?.props.unsubscribeUrl as string)

      const response = await app.inject({
        method: 'GET',
        url: `${url.pathname.replace('/api/v1', '')}${url.search}`,
      })

      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toContain('type=feedback_received')
    })
  })
})
