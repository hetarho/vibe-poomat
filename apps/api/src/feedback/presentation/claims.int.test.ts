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
import { CreditModule } from '../../credit/credit.module'
import { ProjectModule } from '../../project/project.module'
import { StubHttpProbe } from '../../project/test-support/project-doubles'
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
import { ClaimSlotUseCase } from '../application/claim-slot.use-case'
import { FeedbackModule } from '../feedback.module'

const STATE = 'the-state'

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

/**
 * Claims against a real PostgreSQL, with the whole product graph behind them:
 * the mission is real, its escrow is real, and the slot arithmetic is the one
 * the feed and the mission both read.
 */
describe('claims, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let claims: ClaimSlotUseCase

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
    claims = moduleRef.get(ClaimSlotUseCase)
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

  /** A maker with a project and an open mission, which is where every case starts. */
  async function openMission(
    slots: number,
  ): Promise<{ maker: string; missionId: string; projectId: string }> {
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
      payload: { taskText: 'Try signing up', slots },
      cookies: { [SESSION_COOKIE]: maker },
    })

    return { maker, projectId, missionId: (mission.json() as { id: string }).id }
  }

  function claim(session: string, missionId: string) {
    return app.inject({
      method: 'POST',
      url: `/missions/${missionId}/claims`,
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  describe('POST /missions/:id/claims (FDBK-1)', () => {
    it('holds a slot and hands back what was held', async () => {
      const { missionId } = await openMission(2)
      const feedbacker = await signIn('bob-1', 'bob')

      const response = await claim(feedbacker, missionId)

      expect(response.statusCode).toBe(201)
      const held = contract.claimSchema.parse(response.json())
      expect(held.state).toBe('held')
      expect(new Date(held.heldUntil).getTime()).toBeGreaterThan(Date.now())
    })

    it('takes the slot out of what the project shows as claimable (PROJ-9)', async () => {
      const { missionId, projectId } = await openMission(2)
      const feedbacker = await signIn('bob-1', 'bob')
      await claim(feedbacker, missionId)

      const project = await app.inject({ method: 'GET', url: `/projects/${projectId}` })

      expect(projectContract.projectSchema.parse(project.json()).activeMission).toMatchObject({
        slots: 2,
        openSlots: 1,
      })
    })

    it('is 401 without a session', async () => {
      const { missionId } = await openMission(1)

      const response = await app.inject({ method: 'POST', url: `/missions/${missionId}/claims` })

      expect(response.statusCode).toBe(401)
    })

    it('refuses the maker their own project (FDBK-2)', async () => {
      const { maker, missionId } = await openMission(1)

      const response = await claim(maker, missionId)

      expect(response.statusCode).toBe(403)
      expect(response.json()).toMatchObject({ code: 'OWN_PROJECT' })
    })

    it('refuses a second live claim by the same account (FDBK-2)', async () => {
      const { missionId } = await openMission(2)
      const feedbacker = await signIn('bob-1', 'bob')
      await claim(feedbacker, missionId)

      const response = await claim(feedbacker, missionId)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'ALREADY_CLAIMED' })
    })

    it('refuses when every slot is taken', async () => {
      const { missionId } = await openMission(1)
      await claim(await signIn('bob-1', 'bob'), missionId)

      const response = await claim(await signIn('cara-1', 'cara'), missionId)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'NO_SLOTS_AVAILABLE' })
    })

    it('refuses once the mission has been closed', async () => {
      const { maker, missionId } = await openMission(1)
      await app.inject({
        method: 'POST',
        url: `/missions/${missionId}/close`,
        cookies: { [SESSION_COOKIE]: maker },
      })

      const response = await claim(await signIn('bob-1', 'bob'), missionId)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'MISSION_NOT_OPEN' })
    })

    it('leaves exactly one holder when two people take the last slot at once', async () => {
      const { missionId } = await openMission(1)
      const first = await signIn('bob-1', 'bob')
      const second = await signIn('cara-1', 'cara')

      const outcomes = await Promise.all([claim(first, missionId), claim(second, missionId)])

      expect(outcomes.filter((response) => response.statusCode === 201)).toHaveLength(1)
      const rows = await db.execute<{ total: string }>(sql`
        select count(*)::text as total from feedback_claims
        where mission_id = ${missionId} and state = 'held'
      `)
      expect(rows.rows[0]?.total).toBe('1')
    })
  })

  describe('GET /missions/:id/claims/me (FDBK-2)', () => {
    function mine(session: string, missionId: string) {
      return app.inject({
        method: 'GET',
        url: `/missions/${missionId}/claims/me`,
        cookies: { [SESSION_COOKIE]: session },
      })
    }

    it('says nothing is held before anything is', async () => {
      const { missionId } = await openMission(2)
      const feedbacker = await signIn('bob-1', 'bob')

      const response = await mine(feedbacker, missionId)

      expect(response.statusCode).toBe(200)
      expect(contract.myClaimSchema.parse(response.json())).toEqual({ claim: null })
    })

    it('names the claim once one is held, with the hold it runs on', async () => {
      const { missionId } = await openMission(2)
      const feedbacker = await signIn('bob-1', 'bob')
      const held = contract.claimSchema.parse((await claim(feedbacker, missionId)).json())

      const response = await mine(feedbacker, missionId)

      const { claim: found } = contract.myClaimSchema.parse(response.json())
      expect(found).toMatchObject({ id: held.id, state: 'held', heldUntil: held.heldUntil })
    })

    /** FDBK-2 is per account: somebody else's hold is not yours. */
    it('says nothing to an account that holds nothing on it', async () => {
      const { missionId } = await openMission(2)
      const holder = await signIn('bob-1', 'bob')
      await claim(holder, missionId)
      const other = await signIn('cara-1', 'cara')

      expect(contract.myClaimSchema.parse((await mine(other, missionId)).json())).toEqual({
        claim: null,
      })
    })

    it('says nothing for a mission id nobody could hold', async () => {
      const feedbacker = await signIn('bob-1', 'bob')

      expect(contract.myClaimSchema.parse((await mine(feedbacker, 'not-an-id')).json())).toEqual({
        claim: null,
      })
    })

    it('refuses a caller with no session at all', async () => {
      const { missionId } = await openMission(2)

      const response = await app.inject({
        method: 'GET',
        url: `/missions/${missionId}/claims/me`,
      })

      expect(response.statusCode).toBe(401)
    })
  })

  describe('DELETE /claims/:id (FDBK-1)', () => {
    it('gives the slot back and lets the same person take it again', async () => {
      const { missionId } = await openMission(1)
      const feedbacker = await signIn('bob-1', 'bob')
      const held = contract.claimSchema.parse((await claim(feedbacker, missionId)).json())

      const released = await app.inject({
        method: 'DELETE',
        url: `/claims/${held.id}`,
        cookies: { [SESSION_COOKIE]: feedbacker },
      })
      expect(released.statusCode).toBe(204)

      // no re-claim limit in v1, so the way is clear again
      expect((await claim(feedbacker, missionId)).statusCode).toBe(201)
    })

    it('frees the slot for somebody else', async () => {
      const { missionId } = await openMission(1)
      const first = await signIn('bob-1', 'bob')
      const held = contract.claimSchema.parse((await claim(first, missionId)).json())
      await app.inject({
        method: 'DELETE',
        url: `/claims/${held.id}`,
        cookies: { [SESSION_COOKIE]: first },
      })

      expect((await claim(await signIn('cara-1', 'cara'), missionId)).statusCode).toBe(201)
    })

    it('refuses somebody else the slot', async () => {
      const { missionId } = await openMission(2)
      const first = await signIn('bob-1', 'bob')
      const held = contract.claimSchema.parse((await claim(first, missionId)).json())

      const response = await app.inject({
        method: 'DELETE',
        url: `/claims/${held.id}`,
        cookies: { [SESSION_COOKIE]: await signIn('cara-1', 'cara') },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('the release job (FDBK-1)', () => {
    /** Backdates the hold, which is the only way to test a 24-hour timer. */
    async function lapse(claimId: string): Promise<void> {
      await db.execute(sql`
        update feedback_claims set held_until = now() - interval '1 minute' where id = ${claimId}
      `)
    }

    it('frees a slot whose day ran out', async () => {
      const { missionId } = await openMission(1)
      const held = contract.claimSchema.parse(
        (await claim(await signIn('bob-1', 'bob'), missionId)).json(),
      )
      await lapse(held.id)

      expect((await claims.releaseIfLapsed(held.id)).isOk()).toBe(true)

      const rows = await db.execute<{ state: string }>(
        sql`select state from feedback_claims where id = ${held.id}`,
      )
      expect(rows.rows[0]?.state).toBe('released')
      expect((await claim(await signIn('cara-1', 'cara'), missionId)).statusCode).toBe(201)
    })

    it('running it twice changes nothing more', async () => {
      const { missionId } = await openMission(1)
      const held = contract.claimSchema.parse(
        (await claim(await signIn('bob-1', 'bob'), missionId)).json(),
      )
      await lapse(held.id)
      await claims.releaseIfLapsed(held.id)

      expect((await claims.releaseIfLapsed(held.id)).isOk()).toBe(true)

      const rows = await db.execute<{ total: string }>(sql`
        select count(*)::text as total from feedback_claims
        where mission_id = ${missionId} and state = 'released'
      `)
      expect(rows.rows[0]?.total).toBe('1')
    })

    it('leaves a hold that still stands alone', async () => {
      const { missionId } = await openMission(1)
      const held = contract.claimSchema.parse(
        (await claim(await signIn('bob-1', 'bob'), missionId)).json(),
      )

      await claims.releaseIfLapsed(held.id)

      const rows = await db.execute<{ state: string }>(
        sql`select state from feedback_claims where id = ${held.id}`,
      )
      expect(rows.rows[0]?.state).toBe('held')
    })
  })

  describe('what a held slot means to the mission (PROJ-6, CRED-5)', () => {
    it('keeps its credit escrowed when the maker closes the mission', async () => {
      const { maker, missionId } = await openMission(2)
      await claim(await signIn('bob-1', 'bob'), missionId)

      await app.inject({
        method: 'POST',
        url: `/missions/${missionId}/close`,
        cookies: { [SESSION_COOKIE]: maker },
      })

      const me = await app.inject({
        method: 'GET',
        url: '/credits/me',
        cookies: { [SESSION_COOKIE]: maker },
      })
      // one slot came back, the held one waits for that feedback to settle
      expect(me.json()).toMatchObject({ balance: 1, escrowed: 1 })
    })
  })
})
