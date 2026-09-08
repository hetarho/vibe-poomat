import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { projects as contract } from '@repo/contracts'
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
import { ClaimStoreModule } from '../../feedback/claim-store.module'
import { HTTP_PROBE } from '../../shared/application'
import { ConfigModule } from '../../shared/config/config.module'
import { DbModule } from '../../shared/db/db.module'
import { DB, type Db } from '../../shared/db/db.token'
import { EventsModule } from '../../shared/events/events.module'
import { HealthModule } from '../../shared/health/health.module'
import { JobsModule } from '../../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../../shared/infrastructure/storage/storage.module'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { ok } from '../../shared/result'
import { POPULAR_WINDOW_DAYS } from '../domain/feed.query'
import { ProjectModule } from '../project.module'
import { StubHttpProbe } from '../test-support/project-doubles'

const STATE = 'the-state'
const DAY_MS = 24 * 60 * 60 * 1000

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

describe('the feed, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe

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
        ClaimStoreModule,
        AuthModule,
        ProjectModule,
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
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
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

  async function createProject(
    session: string,
    title: string,
    tags: string[] = ['SaaS'],
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: { title, liveUrl: 'https://poomat.test', pitch: 'Trade real feedback', tags },
      cookies: { [SESSION_COOKIE]: session },
    })

    return (response.json() as { id: string }).id
  }

  async function openMission(session: string, projectId: string, slots = 1): Promise<void> {
    await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots },
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  async function feed(query = '', session?: string) {
    const response = await app.inject({
      method: 'GET',
      url: `/projects${query}`,
      ...(session === undefined ? {} : { cookies: { [SESSION_COOKIE]: session } }),
    })

    return contract.feedPageSchema.parse(response.json())
  }

  function titles(page: { items: { title: string }[] }): string[] {
    return page.items.map((item) => item.title)
  }

  describe('the default order (PROJ-9)', () => {
    it('puts a project with an open mission ahead of a newer one without', async () => {
      const session = await signIn('ada-1', 'ada')
      const older = await createProject(session, 'Older with a mission')
      await openMission(session, older)
      await createProject(session, 'Newer without one')

      expect(titles(await feed())).toEqual(['Older with a mission', 'Newer without one'])
    })

    it('orders the rest newest first', async () => {
      const session = await signIn('ada-1', 'ada')
      await createProject(session, 'First')
      await createProject(session, 'Second')
      await createProject(session, 'Third')

      expect(titles(await feed())).toEqual(['Third', 'Second', 'First'])
    })

    it('never shows a project that has been hidden (PROJ-8)', async () => {
      const session = await signIn('ada-1', 'ada')
      const hidden = await createProject(session, 'Hidden')
      await createProject(session, 'Visible')
      await app.inject({
        method: 'DELETE',
        url: `/projects/${hidden}`,
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(titles(await feed())).toEqual(['Visible'])
    })

    it('narrows by tag, and to nothing for a tag nobody can have', async () => {
      const session = await signIn('ada-1', 'ada')
      await createProject(session, 'A tool', ['Tool'])
      await createProject(session, 'A game', ['Game', 'AI'])

      expect(titles(await feed('?tag=Game'))).toEqual(['A game'])
      expect(titles(await feed('?tag=AI'))).toEqual(['A game'])
      expect(titles(await feed('?tag=Crypto'))).toEqual([])
    })

    it('walks pages with a cursor rather than an offset (ARCH-17)', async () => {
      const session = await signIn('ada-1', 'ada')
      for (const title of ['First', 'Second', 'Third']) await createProject(session, title)

      const first = await feed('?limit=2')
      expect(titles(first)).toEqual(['Third', 'Second'])
      expect(first.nextCursor).not.toBeNull()

      const second = await feed(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`)
      expect(titles(second)).toEqual(['First'])
      expect(second.nextCursor).toBeNull()
    })

    it('refuses a cursor somebody made up', async () => {
      const response = await app.inject({ method: 'GET', url: '/projects?cursor=nonsense' })

      expect(response.statusCode).toBe(422)
      expect(response.json()).toMatchObject({ code: 'FEED_CURSOR_NOT_ALLOWED' })
    })

    it('shows the claimable slots on the open mission', async () => {
      const session = await signIn('ada-1', 'ada')
      const projectId = await createProject(session, 'With a mission')
      await openMission(session, projectId, 2)

      const page = await feed()

      expect(page.items[0]).toMatchObject({ claimableSlots: 2 })
    })
  })

  describe('the popular tab (PROJ-10)', () => {
    /** Backdates a vote, which is the only way to test a seven-day window. */
    async function upvoteAgedBy(voter: string, projectId: string, days: number): Promise<void> {
      await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/upvote`,
        cookies: { [SESSION_COOKIE]: voter },
      })
      if (days === 0) return

      await db.execute(sql`
        update upvotes set created_at = now() - make_interval(days => ${days})
        where project_id = ${projectId}
      `)
    }

    it('counts an upvote inside the window and ignores one outside it', async () => {
      const owner = await signIn('ada-1', 'ada')
      const inside = await createProject(owner, 'Voted six days ago')
      const outside = await createProject(owner, 'Voted eight days ago')
      const voter = await signIn('bob-1', 'bob')

      await upvoteAgedBy(voter, inside, POPULAR_WINDOW_DAYS - 1)
      await upvoteAgedBy(voter, outside, POPULAR_WINDOW_DAYS + 1)

      expect(titles(await feed('?sort=popular'))).toEqual([
        'Voted six days ago',
        'Voted eight days ago',
      ])
    })

    it('breaks a tie on the window by the total, then by recency', async () => {
      const owner = await signIn('ada-1', 'ada')
      const older = await createProject(owner, 'Older')
      const newer = await createProject(owner, 'Newer')
      const voter = await signIn('bob-1', 'bob')
      // neither has a recent vote, so the tie falls to the total and then to age
      await upvoteAgedBy(voter, older, POPULAR_WINDOW_DAYS + 1)

      expect(titles(await feed('?sort=popular'))).toEqual(['Older', 'Newer'])
    })

    it('ignores the open-mission rank, which is the feedback feed’s business', async () => {
      const owner = await signIn('ada-1', 'ada')
      const withMission = await createProject(owner, 'With a mission')
      const voted = await createProject(owner, 'Voted for')
      await openMission(owner, withMission)
      const voter = await signIn('bob-1', 'bob')
      await upvoteAgedBy(voter, voted, 0)

      expect(titles(await feed('?sort=popular'))).toEqual(['Voted for', 'With a mission'])
    })
  })

  /** AUTH-3's profile list, which narrows the same query rather than a second one. */
  describe('?owner= (AUTH-3)', () => {
    async function accountBehind(session: string): Promise<string> {
      const me = await app.inject({
        method: 'GET',
        url: '/auth/me',
        cookies: { [SESSION_COOKIE]: session },
      })

      return (me.json() as { id: string }).id
    }

    it('answers with that account’s projects and nobody else’s', async () => {
      const ada = await signIn('ada-1', 'ada')
      const adaId = await accountBehind(ada)
      await createProject(ada, 'Ada one')
      await createProject(ada, 'Ada two')
      await createProject(await signIn('bob-1', 'bob'), 'Bob one')

      const page = await feed(`?owner=${adaId}`)

      expect(titles(page).toSorted()).toEqual(['Ada one', 'Ada two'])
    })

    it('is empty for an account with nothing, rather than the whole feed', async () => {
      await createProject(await signIn('ada-1', 'ada'), 'Ada one')
      const bobId = await accountBehind(await signIn('bob-1', 'bob'))

      expect((await feed(`?owner=${bobId}`)).items).toEqual([])
    })

    /** Narrowing to nothing is honest; widening back to everybody would not be. */
    it('is empty for an owner that is not an account id at all', async () => {
      await createProject(await signIn('ada-1', 'ada'), 'Ada one')

      expect((await feed('?owner=not-an-id')).items).toEqual([])
    })

    it('leaves a hidden project out, the same as the open feed does (PROJ-8)', async () => {
      const ada = await signIn('ada-1', 'ada')
      const adaId = await accountBehind(ada)
      const hidden = await createProject(ada, 'Ada hidden')
      await createProject(ada, 'Ada visible')
      await app.inject({
        method: 'DELETE',
        url: `/projects/${hidden}`,
        cookies: { [SESSION_COOKIE]: ada },
      })

      expect(titles(await feed(`?owner=${adaId}`))).toEqual(['Ada visible'])
    })

    it('still pages, so a prolific account is not one enormous answer', async () => {
      const ada = await signIn('ada-1', 'ada')
      const adaId = await accountBehind(ada)
      for (const title of ['one', 'two', 'three']) {
        await createProject(ada, `Ada ${title}`)
      }

      const first = await feed(`?owner=${adaId}&limit=2`)
      expect(first.items).toHaveLength(2)
      expect(first.nextCursor).not.toBeNull()

      const rest = await feed(`?owner=${adaId}&limit=2&cursor=${first.nextCursor}`)
      expect(rest.items).toHaveLength(1)
      expect(titles(first).concat(titles(rest)).toSorted()).toEqual([
        'Ada one',
        'Ada three',
        'Ada two',
      ])
    })
  })

  describe('POST /projects/:id/upvote (PROJ-11)', () => {
    async function toggle(session: string, projectId: string) {
      return app.inject({
        method: 'POST',
        url: `/projects/${projectId}/upvote`,
        cookies: { [SESSION_COOKIE]: session },
      })
    }

    it('toggles on and back off, leaving the count where it started', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')
      const voter = await signIn('bob-1', 'bob')

      const on = contract.upvoteResultSchema.parse((await toggle(voter, projectId)).json())
      expect(on).toEqual({ upvoted: true, upvoteCount: 1 })

      const off = contract.upvoteResultSchema.parse((await toggle(voter, projectId)).json())
      expect(off).toEqual({ upvoted: false, upvoteCount: 0 })
    })

    it('keeps upvote_count equal to what count(*) would say', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')
      await toggle(await signIn('bob-1', 'bob'), projectId)
      await toggle(await signIn('cara-1', 'cara'), projectId)

      const rows = await db.execute<{ cached: number; actual: string }>(sql`
        select
          p.upvote_count as cached,
          (select count(*)::text from upvotes u where u.project_id = p.id) as actual
        from projects p where p.id = ${projectId}
      `)
      expect(String(rows.rows[0]?.cached)).toBe(rows.rows[0]?.actual)
    })

    it('refuses your own project', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')

      const response = await toggle(owner, projectId)

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'CANNOT_UPVOTE_OWN_PROJECT' })
    })

    it('ends with one row when the same person taps twice at once', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')
      const voter = await signIn('bob-1', 'bob')

      await Promise.all([toggle(voter, projectId), toggle(voter, projectId)])

      const rows = await db.execute<{ total: string }>(
        sql`select count(*)::text as total from upvotes where project_id = ${projectId}`,
      )
      expect(Number(rows.rows[0]?.total)).toBeLessThanOrEqual(1)
    })

    it('is 401 without a session', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')

      const response = await app.inject({
        method: 'POST',
        url: `/projects/${projectId}/upvote`,
      })

      expect(response.statusCode).toBe(401)
    })

    it('shows the caller their own vote on the feed, and nobody else theirs', async () => {
      const owner = await signIn('ada-1', 'ada')
      const projectId = await createProject(owner, 'Poomat')
      const voter = await signIn('bob-1', 'bob')
      await toggle(voter, projectId)

      expect((await feed('', voter)).items[0]).toMatchObject({ upvotedByViewer: true })
      expect((await feed()).items[0]).toMatchObject({ upvotedByViewer: false, upvoteCount: 1 })
    })
  })
})
