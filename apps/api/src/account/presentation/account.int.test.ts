import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test, type TestingModule } from '@nestjs/testing'
import { feedback as feedbackContract, projects as projectContract } from '@repo/contracts'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderClient,
  type OAuthProviderRegistry,
  type ProviderProfile,
} from '../../auth/application/oauth-provider'
import { AuthModule } from '../../auth/auth.module'
import { OAUTH_STATE_COOKIE } from '../../auth/presentation/auth-cookies'
import { registerPlugins } from '../../bootstrap'
import { CreditLedgerService } from '../../credit/application/credit-ledger.service'
import { CreditModule } from '../../credit/credit.module'
import { CREDIT_LEDGER, type CreditLedger } from '../../credit/domain/credit-ledger.repository'
import { FeedbackModule } from '../../feedback/feedback.module'
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
import {
  ACCOUNT_ERASURE,
  type AccountErasure,
  HTTP_PROBE,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { MailModule } from '../../shared/infrastructure/mail/mail.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule, SESSION_COOKIE } from '../../shared/presentation'
import { ConflictError, err, ok } from '../../shared/result'
import { AccountModule } from '../account.module'

const STATE = 'the-state'
const ENOUGH = 'a report long enough to count for anything'
const SEED_CREDITS = 2

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

type Person = { session: string; id: string; handle: string }

/**
 * AUTH-9 end to end, against a real PostgreSQL. The fixture is deliberately the
 * awkward one: an open mission with slots nobody took, a report waiting on a
 * decision, a slot somebody else is holding, feedback this account gave to
 * somebody else, and credits in both the balance and the escrow.
 */
describe('deleting an account, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let credits: CreditLedgerService
  let ledger: CreditLedger
  let transactions: TransactionManager
  let moduleRef: TestingModule
  let people = 0
  let signIns = 0

  beforeAll(async () => {
    probe = new StubHttpProbe()

    moduleRef = await Test.createTestingModule({
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
        AccountModule,
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
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
  })

  /**
   * Signing in is anonymous, so the write throttler keys it by client IP — and
   * this fixture signs in far more people than one address is allowed in a
   * minute. `trustProxy: 1` means the forwarded address is the one counted, so
   * giving each person their own is both realistic and enough.
   */
  function nextClientIp(): string {
    signIns += 1

    return `10.0.${Math.floor(signIns / 250)}.${(signIns % 250) + 1}`
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
      headers: { 'x-forwarded-for': nextClientIp() },
    })
    const raw = response.headers['set-cookie']
    const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
    const cookie = all.find((candidate) => candidate.startsWith(`${SESSION_COOKIE}=`)) ?? ''

    return cookie.slice(`${SESSION_COOKIE}=`.length, cookie.indexOf(';'))
  }

  async function person(tag: string): Promise<Person> {
    const session = await signIn(tag, tag)
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE]: session },
    })
    const body = me.json() as { id: string; handle: string }

    return { session, id: body.id, handle: body.handle }
  }

  async function project(owner: Person, tag: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        title: `Poomat ${tag}`,
        liveUrl: `https://${tag}.test`,
        pitch: 'Trade real feedback',
        tags: ['SaaS'],
      },
      cookies: { [SESSION_COOKIE]: owner.session },
    })

    return (response.json() as { id: string }).id
  }

  async function mission(owner: Person, projectId: string, slots: number): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots },
      cookies: { [SESSION_COOKIE]: owner.session },
    })

    return (response.json() as { id: string }).id
  }

  async function claim(taker: Person, missionId: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: `/missions/${missionId}/claims`,
      cookies: { [SESSION_COOKIE]: taker.session },
    })

    return (response.json() as { id: string }).id
  }

  async function submit(taker: Person, claimId: string): Promise<string> {
    const response = await app.inject({
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
      cookies: { [SESSION_COOKIE]: taker.session },
    })

    return (response.json() as { id: string }).id
  }

  function deleteAccount(who: Person, confirm = who.handle) {
    return app.inject({
      method: 'DELETE',
      url: '/users/me',
      payload: { confirm },
      cookies: { [SESSION_COOKIE]: who.session },
    })
  }

  /** CRED-6: the cached figures must always equal what the log alone says. */
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

  /**
   * The whole AUTH-9 fixture. `ada` is the one being deleted: she runs a mission
   * with two slots, one of which carries a report waiting on her, she holds a
   * slot on somebody else's mission, and she has given feedback that was
   * accepted.
   */
  async function fixture(tag: string): Promise<{
    ada: Person
    bob: Person
    cat: Person
    adaProject: string
    adaMission: string
    pendingFeedback: string
    givenFeedback: string
    catMission: string
    adaHeldClaim: string
  }> {
    people += 1
    const ada = await person(`ada${tag}${people}`)
    const bob = await person(`bob${tag}${people}`)
    const cat = await person(`cat${tag}${people}`)

    // ada's own mission: two slots, one report turned in, one slot untouched
    const adaProject = await project(ada, `ada${tag}${people}`)
    const adaMission = await mission(ada, adaProject, 2)
    const pendingFeedback = await submit(bob, await claim(bob, adaMission))

    // ada gives feedback on bob's project, and bob accepts it
    const bobProject = await project(bob, `bob${tag}${people}`)
    const bobMission = await mission(bob, bobProject, 1)
    const givenFeedback = await submit(ada, await claim(ada, bobMission))
    await app.inject({
      method: 'POST',
      url: `/feedbacks/${givenFeedback}/accept`,
      cookies: { [SESSION_COOKIE]: bob.session },
    })

    // and ada is sitting on a slot of cat's mission without having turned in
    const catProject = await project(cat, `cat${tag}${people}`)
    const catMission = await mission(cat, catProject, 1)
    const adaHeldClaim = await claim(ada, catMission)

    return {
      ada,
      bob,
      cat,
      adaProject,
      adaMission,
      pendingFeedback,
      givenFeedback,
      catMission,
      adaHeldClaim,
    }
  }

  describe('DELETE /users/me (AUTH-9)', () => {
    it('answers 204 and clears the session cookie', async () => {
      const { ada } = await fixture('ok')

      const response = await deleteAccount(ada)

      expect(response.statusCode).toBe(204)
      const raw = response.headers['set-cookie']
      const all = Array.isArray(raw) ? (raw as string[]) : [String(raw)]
      expect(all.find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`))).toContain('Max-Age=0')
    })

    it('leaves the account signed out everywhere, not only on this device', async () => {
      const { ada } = await fixture('sessions')
      const second = await signIn(ada.handle, ada.handle)
      await deleteAccount(ada)

      for (const session of [ada.session, second]) {
        const response = await app.inject({
          method: 'GET',
          url: '/auth/me',
          cookies: { [SESSION_COOKIE]: session },
        })
        expect(response.statusCode).toBe(401)
      }
    })

    it('leaves nothing of the account behind (AUTH-9)', async () => {
      const { ada } = await fixture('rows')

      await deleteAccount(ada)

      for (const table of ['users', 'sessions', 'identities'] as const) {
        const column = table === 'users' ? 'id' : 'user_id'
        const { rows } = await db.execute<{ count: string }>(
          sql`select count(*)::int as count from ${sql.identifier(table)}
              where ${sql.identifier(column)} = ${ada.id}`,
        )
        expect(Number(rows[0]?.count)).toBe(0)
      }
    })

    it('is 401 without a session, and there is no admin path (AUTH-12)', async () => {
      const { ada } = await fixture('unauth')

      const response = await app.inject({
        method: 'DELETE',
        url: '/users/me',
        payload: { confirm: ada.handle },
      })

      expect(response.statusCode).toBe(401)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            cookies: { [SESSION_COOKIE]: ada.session },
          })
        ).statusCode,
      ).toBe(200)
    })
  })

  describe('what the sequence does to the credits (CRED-4, CRED-8)', () => {
    it('pays the pending feedbacker before it voids the remainder', async () => {
      const { ada, bob } = await fixture('credits')
      const bobBefore = await credits.stateOf(bob.id)

      await deleteAccount(ada)

      // bob turned in a report on ada's mission and is paid for it, and he also
      // spent one opening his own mission, which ada's accepted report settled
      const bobAfter = await credits.stateOf(bob.id)
      expect(bobAfter.received).toBe(bobBefore.received + 1)
      expect(bobAfter.balance).toBe(bobBefore.balance + 1)
      await expectLedgerHolds(bob.id)
    })

    it('leaves the deleted account holding nothing at all (CRED-8)', async () => {
      const { ada } = await fixture('void')

      await deleteAccount(ada)

      expect(await credits.stateOf(ada.id)).toMatchObject({ balance: 0, escrowed: 0 })
    })

    /** CRED-6: the void entries have to balance the log, not just zero a cache. */
    it('keeps the ledger invariant for every account afterwards', async () => {
      const { ada, bob, cat } = await fixture('invariant')

      await deleteAccount(ada)

      for (const account of [ada.id, bob.id, cat.id]) {
        await expectLedgerHolds(account)
      }
    })

    it('refunds the slots nobody took before voiding, so nothing is silently lost', async () => {
      const { ada } = await fixture('refund')
      const before = await credits.stateOf(ada.id)

      await deleteAccount(ada)

      // the seed paid for two of her own slots and one report she wrote; whatever
      // was still hers is gone, and the log says where every credit went
      expect(before.balance + before.escrowed).toBeGreaterThan(0)
      await expectLedgerHolds(ada.id)
    })
  })

  describe('what the sequence does to other people’s work', () => {
    it('settles the report waiting on her, marking it accepted by the clock', async () => {
      const { ada, pendingFeedback } = await fixture('settle')

      await deleteAccount(ada)

      const read = await app.inject({ method: 'GET', url: `/feedbacks/${pendingFeedback}` })
      const body = feedbackContract.feedbackSchema.parse(read.json())
      expect(body.state).toBe('accepted')
      expect(body.automatic).toBe(true)
    })

    /** FDBK-9: what she gave other people survives her, without her name on it. */
    it('keeps the feedback she gave public, with a null author', async () => {
      const { ada, givenFeedback } = await fixture('anon')
      await app.inject({
        method: 'POST',
        url: `/feedbacks/${givenFeedback}/replies`,
        payload: { body: 'thanks for reading it' },
        cookies: { [SESSION_COOKIE]: ada.session },
      })

      await deleteAccount(ada)

      const read = await app.inject({ method: 'GET', url: `/feedbacks/${givenFeedback}` })
      expect(read.statusCode).toBe(200)
      expect(feedbackContract.feedbackSchema.parse(read.json()).author).toBeNull()

      const thread = await app.inject({ method: 'GET', url: `/feedbacks/${givenFeedback}/replies` })
      const page = feedbackContract.threadPageSchema.parse(thread.json())
      expect(page.items).toHaveLength(1)
      expect(page.items[0]?.author).toBeNull()
      expect(page.items[0]?.body).toBe('thanks for reading it')
    })

    /** FDBK-1: the slot she was sitting on goes back into somebody else's pool. */
    it('hands back the slot she was holding on another mission', async () => {
      const { ada, cat, catMission } = await fixture('hold')

      await deleteAccount(ada)

      const { rows } = await db.execute<{ project_id: string }>(
        sql`select project_id from missions where id = ${catMission}`,
      )
      const read = await app.inject({
        method: 'GET',
        url: `/projects/${rows[0]?.project_id}`,
        cookies: { [SESSION_COOKIE]: cat.session },
      })
      expect(projectContract.projectSchema.parse(read.json()).activeMission).toMatchObject({
        slots: 1,
        openSlots: 1,
      })
    })

    it('takes her projects out of the feed', async () => {
      const { ada, adaProject } = await fixture('feed')

      await deleteAccount(ada)

      expect((await app.inject({ method: 'GET', url: `/projects/${adaProject}` })).statusCode).toBe(
        404,
      )
      const feed = await app.inject({ method: 'GET', url: '/projects?limit=100' })
      const ids = projectContract.feedPageSchema.parse(feed.json()).items.map((item) => item.id)
      expect(ids).not.toContain(adaProject)
    })

    it('ends her open mission rather than leaving it taking feedback', async () => {
      const { ada, adaMission } = await fixture('mission')

      await deleteAccount(ada)

      const { rows } = await db.execute<{ state: string }>(
        sql`select state from missions where id = ${adaMission}`,
      )
      expect(rows[0]?.state).not.toBe('open')
    })
  })

  describe('a confirmation that does not match', () => {
    it('is refused with a code the UI can act on, and changes nothing', async () => {
      const { ada, adaProject, pendingFeedback } = await fixture('confirm')
      const before = await credits.stateOf(ada.id)

      const response = await deleteAccount(ada, 'notmyhandle')

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({ code: 'DELETION_NOT_CONFIRMED' })

      // every one of AUTH-9's outcomes is still un-done
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            cookies: { [SESSION_COOKIE]: ada.session },
          })
        ).statusCode,
      ).toBe(200)
      expect((await app.inject({ method: 'GET', url: `/projects/${adaProject}` })).statusCode).toBe(
        200,
      )
      const read = await app.inject({ method: 'GET', url: `/feedbacks/${pendingFeedback}` })
      expect(feedbackContract.feedbackSchema.parse(read.json()).state).toBe('pending')
      expect(await credits.stateOf(ada.id)).toMatchObject({
        balance: before.balance,
        escrowed: before.escrowed,
      })
    })

    it('refuses a confirmation that is not even a legal handle', async () => {
      const { ada } = await fixture('illegal')

      const response = await deleteAccount(ada, 'NOT A HANDLE!')

      expect(response.statusCode).toBe(422)
    })

    it('refuses somebody else’s handle', async () => {
      const { ada, bob } = await fixture('other')

      expect((await deleteAccount(ada, bob.handle)).statusCode).toBe(422)
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            cookies: { [SESSION_COOKIE]: ada.session },
          })
        ).statusCode,
      ).toBe(200)
    })
  })

  /**
   * ARCH-38's claim, which nothing else here proves: the four contexts really do
   * move together. The last step is made to fail, and every earlier one — in a
   * different context each — has to be undone.
   *
   * The port is swapped on the running application rather than in a second one:
   * two Nest apps in a process fight over the same database handle, and the
   * loser is whichever test runs after the other is closed.
   */
  describe('when a step fails half way through', () => {
    it('rolls back every context, not only the one that failed', async () => {
      const { ada, adaProject, adaMission, pendingFeedback, adaHeldClaim } =
        await fixture('rollback')
      const before = await credits.stateOf(ada.id)

      const erasure = moduleRef.get<AccountErasure>(ACCOUNT_ERASURE)
      const original = erasure.eraseAccount.bind(erasure)
      erasure.eraseAccount = async () => err(new ConflictError('this step said no'))

      try {
        const response = await deleteAccount(ada)
        expect(response.statusCode).toBe(409)
      } finally {
        erasure.eraseAccount = original
      }

      // auth: still an account, still signed in
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/auth/me',
            cookies: { [SESSION_COOKIE]: ada.session },
          })
        ).statusCode,
      ).toBe(200)
      // project: the mission is still open and the project still public
      const missionRows = await db.execute<{ state: string }>(
        sql`select state from missions where id = ${adaMission}`,
      )
      expect(missionRows.rows[0]?.state).toBe('open')
      expect((await app.inject({ method: 'GET', url: `/projects/${adaProject}` })).statusCode).toBe(
        200,
      )
      // feedback: nothing settled and nothing released
      const read = await app.inject({ method: 'GET', url: `/feedbacks/${pendingFeedback}` })
      expect(feedbackContract.feedbackSchema.parse(read.json()).state).toBe('pending')
      const claimRows = await db.execute<{ state: string }>(
        sql`select state from feedback_claims where id = ${adaHeldClaim}`,
      )
      expect(claimRows.rows[0]?.state).toBe('held')
      // credit: not one entry written
      expect(await credits.stateOf(ada.id)).toMatchObject({
        balance: before.balance,
        escrowed: before.escrowed,
      })
      await expectLedgerHolds(ada.id)
    })
  })

  describe('signing in again afterwards', () => {
    it('creates a new account rather than restoring the old one', async () => {
      const { ada } = await fixture('again')
      const oldId = ada.id
      await deleteAccount(ada)

      const back = await person(ada.handle)

      expect(back.id).not.toBe(oldId)
      expect(await credits.stateOf(back.id)).toMatchObject({ balance: SEED_CREDITS })
    })
  })
})
