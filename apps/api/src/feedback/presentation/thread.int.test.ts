import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { feedback as contract } from '@repo/contracts'
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
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
import { HTTP_PROBE } from '../../shared/application'
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
import { FeedbackModule } from '../feedback.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count for anything'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

type Replied = { feedbackId: string; authorId: string; recipientId: string }

/**
 * FDBK-5's thread against a real PostgreSQL. The two things worth proving here
 * are the ones no unit test can: that the keyset walks the conversation forwards
 * without repeating or dropping a row, and that a reply outlives the account
 * that wrote it (AUTH-9).
 */
describe('the feedback thread, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let replied: Replied[]

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

    replied = []
    moduleRef.get(DomainEventRegistry).register({
      eventName: CROSS_CONTEXT_EVENTS.threadReplied,
      handle: async (event) => {
        const announced = event as unknown as Replied
        replied.push({
          feedbackId: announced.feedbackId,
          authorId: announced.authorId,
          recipientId: announced.recipientId,
        })
      },
    })
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
    replied = []
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

  /** A submitted report with both of its participants signed in. */
  async function pendingReport(): Promise<{
    maker: string
    makerId: string
    feedbacker: string
    feedbackerId: string
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
      payload: { taskText: 'Try signing up', slots: 1 },
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
      feedbackId: (submitted.json() as { id: string }).id,
    }
  }

  function post(session: string | null, feedbackId: string, body: string) {
    return app.inject({
      method: 'POST',
      url: `/feedbacks/${feedbackId}/replies`,
      payload: { body },
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
    })
  }

  function read(feedbackId: string, query = '') {
    return app.inject({ method: 'GET', url: `/feedbacks/${feedbackId}/replies${query}` })
  }

  describe('POST /feedbacks/:id/replies (FDBK-5)', () => {
    it('takes the maker, and names them as the author', async () => {
      const { maker, feedbackId } = await pendingReport()

      const response = await post(maker, feedbackId, 'thanks — which browser?')

      expect(response.statusCode).toBe(201)
      const reply = contract.feedbackReplySchema.parse(response.json())
      expect(reply.author?.handle).toBe('ada')
      expect(reply.body).toBe('thanks — which browser?')
      expect(reply.feedbackId).toBe(feedbackId)
    })

    it('takes the feedbacker too', async () => {
      const { feedbacker, feedbackId } = await pendingReport()

      const response = await post(feedbacker, feedbackId, 'Firefox 130, on Linux')

      expect(response.statusCode).toBe(201)
      expect(contract.feedbackReplySchema.parse(response.json()).author?.handle).toBe('bob')
    })

    it('refuses a third party by name, and writes nothing', async () => {
      const { feedbackId } = await pendingReport()
      const stranger = await signIn('cat-1', 'cat')

      const response = await post(stranger, feedbackId, 'me too')

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'NOT_A_THREAD_PARTICIPANT' })
      expect(contract.threadPageSchema.parse((await read(feedbackId)).json()).items).toEqual([])
    })

    it('is 401 without a session', async () => {
      const { feedbackId } = await pendingReport()

      expect((await post(null, feedbackId, 'hello')).statusCode).toBe(401)
    })

    it.each([
      ['empty', ''],
      ['whitespace only', '   '],
      ['past 2000 characters', 'a'.repeat(contract.REPLY_MAX_LENGTH + 1)],
    ])('refuses a body that is %s', async (_name, body) => {
      const { maker, feedbackId } = await pendingReport()

      expect((await post(maker, feedbackId, body)).statusCode).toBe(422)
    })

    it('is 404 for a report nobody wrote', async () => {
      const maker = await signIn('ada-1', 'ada')

      const response = await post(maker, '01890000-0000-7000-8000-000000000000', 'hello')

      expect(response.statusCode).toBe(404)
    })

    it('announces the other participant as the recipient', async () => {
      const { maker, makerId, feedbacker, feedbackerId, feedbackId } = await pendingReport()

      await post(maker, feedbackId, 'thanks for this')
      await post(feedbacker, feedbackId, 'happy to help')

      expect(replied).toEqual([
        { feedbackId, authorId: makerId, recipientId: feedbackerId },
        { feedbackId, authorId: feedbackerId, recipientId: makerId },
      ])
    })
  })

  describe('GET /feedbacks/:id/replies (FDBK-9, ARCH-17)', () => {
    it('is public, and reads oldest first', async () => {
      const { maker, feedbacker, feedbackId } = await pendingReport()
      await post(maker, feedbackId, 'one')
      await post(feedbacker, feedbackId, 'two')
      await post(maker, feedbackId, 'three')

      const response = await read(feedbackId)

      expect(response.statusCode).toBe(200)
      const page = contract.threadPageSchema.parse(response.json())
      expect(page.items.map((item) => item.body)).toEqual(['one', 'two', 'three'])
      expect(page.nextCursor).toBeNull()
    })

    it('walks the whole thread through the cursor, once each', async () => {
      const { maker, feedbacker, feedbackId } = await pendingReport()
      const written = ['one', 'two', 'three', 'four', 'five']
      for (const [index, body] of written.entries()) {
        await post(index % 2 === 0 ? maker : feedbacker, feedbackId, body)
      }

      const walked: string[] = []
      let cursor: string | null = null
      let pages = 0
      do {
        const page: contract.ThreadPage = contract.threadPageSchema.parse(
          (await read(feedbackId, `?limit=2${cursor === null ? '' : `&cursor=${cursor}`}`)).json(),
        )
        walked.push(...page.items.map((item) => item.body))
        cursor = page.nextCursor
        pages += 1
      } while (cursor !== null && pages < 10)

      expect(walked).toEqual(written)
      expect(pages).toBe(3)
    })

    it('holds the page steady when a reply lands mid-read', async () => {
      const { maker, feedbacker, feedbackId } = await pendingReport()
      await post(maker, feedbackId, 'one')
      await post(feedbacker, feedbackId, 'two')

      const first = contract.threadPageSchema.parse((await read(feedbackId, '?limit=1')).json())
      await post(maker, feedbackId, 'three')
      const second = contract.threadPageSchema.parse(
        (await read(feedbackId, `?limit=1&cursor=${first.nextCursor}`)).json(),
      )

      // the newcomer sorts after the cursor, so nothing repeats and nothing is skipped
      expect(first.items.map((item) => item.body)).toEqual(['one'])
      expect(second.items.map((item) => item.body)).toEqual(['two'])
    })

    it('is empty for a thread nobody has written in', async () => {
      const { feedbackId } = await pendingReport()

      const page = contract.threadPageSchema.parse((await read(feedbackId)).json())

      expect(page).toEqual({ items: [], nextCursor: null })
    })

    it('is 404 for a report nobody wrote', async () => {
      expect((await read('01890000-0000-7000-8000-000000000000')).statusCode).toBe(404)
    })

    it('refuses a cursor a caller made up', async () => {
      const { feedbackId } = await pendingReport()

      const response = await read(feedbackId, '?cursor=not-a-cursor')

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({ code: 'THREAD_CURSOR_NOT_ALLOWED' })
    })

    /** AUTH-9 anonymises the row rather than deleting it; the reply must survive. */
    it('shows a null author once the account is gone', async () => {
      const { maker, feedbacker, feedbackId } = await pendingReport()
      await post(maker, feedbackId, 'still here')
      await post(feedbacker, feedbackId, 'gone tomorrow')
      await db.execute(
        sql`update feedback_replies set author_id = null where body = 'gone tomorrow'`,
      )

      const page = contract.threadPageSchema.parse((await read(feedbackId)).json())

      expect(page.items.map((item) => item.author?.handle ?? null)).toEqual(['ada', null])
      expect(page.items.map((item) => item.body)).toEqual(['still here', 'gone tomorrow'])
    })
  })

  describe('once the report has been settled (FDBK-5 sets no window)', () => {
    it('still takes a reply, and still announces it', async () => {
      const { maker, makerId, feedbacker, feedbackerId, feedbackId } = await pendingReport()
      await app.inject({
        method: 'POST',
        url: `/feedbacks/${feedbackId}/reject`,
        payload: { reason: 'no_substance', note: 'nothing to act on' },
        cookies: { [SESSION_COOKIE]: maker },
      })
      replied = []

      const answer = await post(feedbacker, feedbackId, 'here is what I actually tried')

      expect(answer.statusCode).toBe(201)
      expect(replied).toEqual([{ feedbackId, authorId: feedbackerId, recipientId: makerId }])
      const page = contract.threadPageSchema.parse((await read(feedbackId)).json())
      expect(page.items).toHaveLength(1)
    })
  })

  describe('what v1 deliberately does not offer', () => {
    it.each([['PATCH' as const], ['PUT' as const], ['DELETE' as const]])(
      'has no %s for a reply',
      async (method) => {
        const { maker, feedbackId } = await pendingReport()
        const reply = contract.feedbackReplySchema.parse(
          (await post(maker, feedbackId, 'unchangeable')).json(),
        )

        const response = await app.inject({
          method,
          url: `/feedbacks/${feedbackId}/replies/${reply.id}`,
          cookies: { [SESSION_COOKIE]: maker },
        })

        expect(response.statusCode).toBe(404)
      },
    )
  })
})
