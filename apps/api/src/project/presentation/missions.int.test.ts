import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { projects as contract } from '@repo/contracts'
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
import { CreditLedgerService } from '../../credit/application/credit-ledger.service'
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
import { ManageMissionUseCase } from '../application/manage-mission.use-case'
import { ProjectModule } from '../project.module'
import { StubHttpProbe } from '../test-support/project-doubles'

const STATE = 'the-state'
const SEED_CREDITS = 2

let nextProfile: ProviderProfile

const oauth: OAuthProviderClient = {
  createAuthorization: () => ({ url: 'https://provider.test/a', state: STATE, codeVerifier: null }),
  fetchProfile: async () => ok(nextProfile),
}

const registry: OAuthProviderRegistry = { clientFor: () => ok(oauth) }

/**
 * Missions against a real PostgreSQL and a real credit ledger. Only the OAuth
 * provider, the outbound probe and the claim rows are replaced — the last
 * because they arrive with T025, and everything here has to work before they do.
 */
describe('missions, against a real PostgreSQL', () => {
  let app: NestFastifyApplication
  let db: Db
  let probe: StubHttpProbe
  let credits: CreditLedgerService
  let missions: ManageMissionUseCase

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
    credits = moduleRef.get(CreditLedgerService)
    missions = moduleRef.get(ManageMissionUseCase)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    probe.probed.length = 0
  })

  async function signIn(providerUserId = '4242', username = 'ada'): Promise<string> {
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

  async function createProject(session: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        title: 'Poomat',
        liveUrl: 'https://poomat.test',
        pitch: 'Trade real feedback',
        tags: ['SaaS'],
      },
      cookies: { [SESSION_COOKIE]: session },
    })

    return (response.json() as { id: string }).id
  }

  function openMission(session: string, projectId: string, body: object = {}) {
    return app.inject({
      method: 'POST',
      url: `/projects/${projectId}/missions`,
      payload: { taskText: 'Try signing up', slots: 2, ...body },
      cookies: { [SESSION_COOKIE]: session },
    })
  }

  /** The account behind a session, which the credit ledger is keyed by. */
  async function accountBehind(session: string): Promise<string> {
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { [SESSION_COOKIE]: session },
    })

    return (me.json() as { id: string }).id
  }

  describe('POST /projects/:id/missions (PROJ-4, CRED-3)', () => {
    it('opens it and moves one credit per slot into escrow', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)

      const response = await openMission(session, projectId, { slots: SEED_CREDITS })

      expect(response.statusCode).toBe(201)
      const mission = contract.missionSchema.parse(response.json())
      expect(mission.state).toBe('open')
      expect(mission.slots).toBe(SEED_CREDITS)
      expect(await credits.stateOf(account)).toMatchObject({ balance: 0, escrowed: SEED_CREDITS })
    })

    it('rolls back both the mission and the escrow when the balance is short', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)

      const response = await openMission(session, projectId, { slots: SEED_CREDITS + 1 })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'CREDIT_INSUFFICIENT' })
      const rows = await db.execute<{ count: string }>(
        sql`select count(*)::text as count from missions`,
      )
      expect(rows.rows[0]?.count).toBe('0')
      expect(await credits.stateOf(account)).toMatchObject({
        balance: SEED_CREDITS,
        escrowed: 0,
      })
    })

    it('refuses a second open mission (PROJ-5)', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      await openMission(session, projectId, { slots: 1 })

      const response = await openMission(session, projectId, { slots: 1 })

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'MISSION_ALREADY_OPEN' })
    })

    it('refuses a stranger', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const stranger = await signIn('bob-1', 'bob')

      const response = await openMission(stranger, projectId)

      expect(response.statusCode).toBe(403)
    })

    it('shows up on the project as the active mission (PROJ-5)', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const opened = contract.missionSchema.parse((await openMission(session, projectId)).json())

      const project = await app.inject({ method: 'GET', url: `/projects/${projectId}` })

      expect(contract.projectSchema.parse(project.json()).activeMission).toMatchObject({
        id: opened.id,
        slots: 2,
        openSlots: 2,
      })
    })

    it('locks the project against deletion and a url change (PROJ-7, PROJ-8)', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      await openMission(session, projectId)

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(deleted.statusCode).toBe(409)

      const moved = await app.inject({
        method: 'PATCH',
        url: `/projects/${projectId}`,
        payload: { liveUrl: 'https://poomat.test/v2' },
        cookies: { [SESSION_COOKIE]: session },
      })
      expect(moved.statusCode).toBe(409)
      expect(moved.json()).toMatchObject({ code: 'PROJECT_LOCKED_BY_MISSION' })
    })
  })

  describe('GET /projects/:id/missions (PROJ-6, PROJ-7)', () => {
    function list(projectId: string) {
      return app.inject({ method: 'GET', url: `/projects/${projectId}/missions` })
    }

    it('is public: the frozen task and questions are what a feedbacker reads', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      await openMission(session, projectId, {
        taskText: 'Try signing up',
        questions: ['Was the first screen clear?'],
        slots: 2,
      })

      const response = await list(projectId)

      expect(response.statusCode).toBe(200)
      const missions = z.array(contract.missionSchema).parse(response.json())
      expect(missions).toHaveLength(1)
      expect(missions[0]).toMatchObject({
        taskText: 'Try signing up',
        questions: ['Was the first screen clear?'],
        slots: 2,
        state: 'open',
      })
    })

    /** The maker's panel needs the breakdown, not just a total (FDBK-1). */
    it('says where every slot stands, all of it claimable at the start', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      // two, because that is what CRED-2 seeds and CRED-3 will not lend more
      await openMission(session, projectId, { slots: 2 })

      const missions = z.array(contract.missionSchema).parse((await list(projectId)).json())

      expect(missions[0]?.occupancy).toEqual({
        claimable: 2,
        held: 0,
        submitted: 0,
        settled: 0,
      })
      expect(missions[0]?.openSlots).toBe(2)
    })

    /** PROJ-6: a closed mission is exactly what `activeMission` cannot name. */
    it('still names a mission after it has been closed, with nothing takeable', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const opened = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 2 })).json(),
      )
      await app.inject({
        method: 'POST',
        url: `/missions/${opened.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })

      const missions = z.array(contract.missionSchema).parse((await list(projectId)).json())

      expect(missions[0]).toMatchObject({ id: opened.id, state: 'closed', openSlots: 0 })
      // nobody took either slot, so both came back (CRED-5)
      expect(missions[0]?.occupancy.claimable).toBe(2)
      expect(missions[0]?.endedAt).not.toBeNull()
    })

    it('reads newest first, so the panel takes the first one', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const first = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 1 })).json(),
      )
      await app.inject({
        method: 'POST',
        url: `/missions/${first.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })
      const second = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 1 })).json(),
      )

      const missions = z.array(contract.missionSchema).parse((await list(projectId)).json())

      expect(missions.map((mission) => mission.id)).toEqual([second.id, first.id])
    })

    it('answers with nothing for a project that has never run one', async () => {
      const projectId = await createProject(await signIn())

      expect(z.array(contract.missionSchema).parse((await list(projectId)).json())).toEqual([])
    })

    it('answers with nothing for something that is not a project id', async () => {
      expect(z.array(contract.missionSchema).parse((await list('not-an-id')).json())).toEqual([])
    })
  })

  describe('GET /missions/:id (PROJ-7)', () => {
    it('is public, so the report form can read the task it is asking about', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const opened = contract.missionSchema.parse(
        (await openMission(session, projectId, { taskText: 'Try signing up', slots: 2 })).json(),
      )

      const response = await app.inject({ method: 'GET', url: `/missions/${opened.id}` })

      expect(response.statusCode).toBe(200)
      expect(contract.missionSchema.parse(response.json())).toMatchObject({
        id: opened.id,
        taskText: 'Try signing up',
        occupancy: { claimable: 2, held: 0, submitted: 0, settled: 0 },
      })
    })

    it.each(['not-an-id', '01920000-0000-7000-8000-0000000000ff'])('is 404 for %s', async (id) => {
      const response = await app.inject({ method: 'GET', url: `/missions/${id}` })

      expect(response.statusCode).toBe(404)
      expect(response.json()).toMatchObject({ code: 'MISSION_NOT_FOUND' })
    })
  })

  describe('POST /missions/:id/close (PROJ-6, CRED-5)', () => {
    it('refunds every slot nobody took', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: SEED_CREDITS })).json(),
      )

      const response = await app.inject({
        method: 'POST',
        url: `/missions/${mission.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(response.statusCode).toBe(200)
      expect(contract.missionSchema.parse(response.json()).state).toBe('closed')
      expect(await credits.stateOf(account)).toMatchObject({
        balance: SEED_CREDITS,
        escrowed: 0,
      })
    })

    it('leaves a held slot escrowed and refunds only the rest', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: SEED_CREDITS })).json(),
      )
      // a real claim row, which is what the mission counts against its slots
      await db.execute(sql`
        insert into feedback_claims (id, mission_id, user_id, state, held_until)
        values (
          ${'01920000-0000-7000-8000-0000000000d1'},
          ${mission.id},
          ${'01920000-0000-7000-8000-0000000000d2'},
          'held',
          now() + interval '1 day'
        )
      `)

      await app.inject({
        method: 'POST',
        url: `/missions/${mission.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })

      // the held slot's credit waits for that feedback to settle (PROJ-6)
      expect(await credits.stateOf(account)).toMatchObject({ balance: 1, escrowed: 1 })
    })

    it('frees the project for deletion again', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 1 })).json(),
      )
      await app.inject({
        method: 'POST',
        url: `/missions/${mission.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/projects/${projectId}`,
        cookies: { [SESSION_COOKIE]: session },
      })

      expect(deleted.statusCode).toBe(204)
    })

    it('refuses a stranger', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 1 })).json(),
      )
      const stranger = await signIn('bob-1', 'bob')

      const response = await app.inject({
        method: 'POST',
        url: `/missions/${mission.id}/close`,
        cookies: { [SESSION_COOKIE]: stranger },
      })

      expect(response.statusCode).toBe(403)
    })
  })

  describe('the expiry job (PROJ-6)', () => {
    it('ends the mission and hands back the unfilled slots', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: SEED_CREDITS })).json(),
      )

      expect((await missions.expire(mission.id)).isOk()).toBe(true)

      const rows = await db.execute<{ state: string }>(
        sql`select state from missions where id = ${mission.id}`,
      )
      expect(rows.rows[0]?.state).toBe('expired')
      expect(await credits.stateOf(account)).toMatchObject({
        balance: SEED_CREDITS,
        escrowed: 0,
      })
    })

    it('running it twice refunds nothing more', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const account = await accountBehind(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: SEED_CREDITS })).json(),
      )
      await missions.expire(mission.id)

      expect((await missions.expire(mission.id)).isOk()).toBe(true)

      expect(await credits.stateOf(account)).toMatchObject({
        balance: SEED_CREDITS,
        escrowed: 0,
      })
    })

    it('does nothing to a mission the maker already closed', async () => {
      const session = await signIn()
      const projectId = await createProject(session)
      const mission = contract.missionSchema.parse(
        (await openMission(session, projectId, { slots: 1 })).json(),
      )
      await app.inject({
        method: 'POST',
        url: `/missions/${mission.id}/close`,
        cookies: { [SESSION_COOKIE]: session },
      })

      await missions.expire(mission.id)

      const rows = await db.execute<{ state: string }>(
        sql`select state from missions where id = ${mission.id}`,
      )
      expect(rows.rows[0]?.state).toBe('closed')
    })
  })
})
