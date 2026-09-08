import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CreditOperations, JobScheduler } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { ConflictError, err, ok } from '../../shared/result'
import { MissionEnded } from '../domain/mission'
import type { MissionRepository } from '../domain/mission-store.repository'
import {
  MAX_QUESTIONS,
  MAX_SLOTS,
  MISSION_LIFETIME_MS,
  TASK_TEXT_MAX_LENGTH,
} from '../domain/mission-values'
import { Project } from '../domain/project'
import { LiveUrl, Pitch, Tags, Title } from '../domain/project-values'
import {
  InMemoryMissionRepository,
  InMemoryProjectRepository,
  passthroughTransactions,
  StubSlotOccupancy,
} from '../test-support/project-doubles'
import { ManageMissionUseCase, MISSION_EXPIRE_JOB, missionJobKey } from './manage-mission.use-case'

const OWNER = EntityId.generate()
const STRANGER = EntityId.generate().value

function project(): Project {
  return Project.create({
    ownerId: OWNER,
    title: Title.create('Poomat')._unsafeUnwrap(),
    liveUrl: LiveUrl.create('https://poomat.test')._unsafeUnwrap(),
    pitch: Pitch.create('Trade real feedback')._unsafeUnwrap(),
    tags: Tags.create(['SaaS'])._unsafeUnwrap(),
  })
}

describe('ManageMissionUseCase', () => {
  let missions: InMemoryMissionRepository
  let projects: InMemoryProjectRepository
  let occupancy: StubSlotOccupancy
  let credits: CreditOperations
  let escrow: ReturnType<typeof vi.fn>
  let refund: ReturnType<typeof vi.fn>
  let schedule: ReturnType<typeof vi.fn>
  let cancel: ReturnType<typeof vi.fn>
  let jobs: JobScheduler
  let useCase: ManageMissionUseCase
  let projectId: string

  beforeEach(async () => {
    missions = new InMemoryMissionRepository()
    projects = new InMemoryProjectRepository()
    occupancy = new StubSlotOccupancy()

    escrow = vi.fn(async () => ok(undefined))
    refund = vi.fn(async () => ok(undefined))
    credits = {
      escrowForMission: escrow as unknown as CreditOperations['escrowForMission'],
      refundUnfilled: refund as unknown as CreditOperations['refundUnfilled'],
      settleSlot: async () => ok(undefined),
      voidAccount: async () => ok(undefined),
    }

    schedule = vi.fn(async () => undefined)
    cancel = vi.fn(async () => undefined)
    jobs = {
      enqueue: async () => undefined,
      schedule: schedule as unknown as JobScheduler['schedule'],
      cancel: cancel as unknown as JobScheduler['cancel'],
    }

    useCase = new ManageMissionUseCase(
      missions as MissionRepository,
      projects,
      occupancy,
      credits,
      jobs,
      passthroughTransactions,
    )

    const posted = project()
    await projects.save(posted)
    projectId = posted.id.value
  })

  function open(overrides: Record<string, unknown> = {}) {
    return useCase.open({
      projectId,
      actorId: OWNER.value,
      taskText: 'Try signing up and tell me where you got stuck',
      slots: 3,
      ...overrides,
    })
  }

  describe('open (PROJ-4)', () => {
    it('escrows exactly one credit per slot (CRED-3)', async () => {
      const view = (await open())._unsafeUnwrap()

      expect(view.slots).toBe(3)
      expect(view.openSlots).toBe(3)
      expect(view.state).toBe('open')
      expect(escrow).toHaveBeenCalledExactlyOnceWith({
        accountId: OWNER.value,
        missionId: view.id,
        credits: 3,
      })
    })

    it('schedules the expiry for thirty days out (PROJ-6)', async () => {
      const view = (await open())._unsafeUnwrap()

      expect(view.expiresAt.getTime() - view.openedAt.getTime()).toBe(MISSION_LIFETIME_MS)
      expect(schedule).toHaveBeenCalledExactlyOnceWith(
        MISSION_EXPIRE_JOB,
        { missionId: view.id },
        view.expiresAt,
        { singletonKey: missionJobKey(view.id) },
      )
    })

    it('keeps the questions the maker asked, up to three', async () => {
      const view = (
        await open({ questions: ['Was it clear?', 'Would you use it?'] })
      )._unsafeUnwrap()

      expect(view.questions).toEqual(['Was it clear?', 'Would you use it?'])
    })

    it('writes nothing when the escrow is refused (CRED-3)', async () => {
      escrow.mockResolvedValueOnce(err(new ConflictError('not enough credits')))

      const outcome = await open()

      expect(outcome.isErr()).toBe(true)
      expect(missions.rows.size).toBe(0)
      expect(schedule).not.toHaveBeenCalled()
    })

    it('refuses a second open mission on the same project (PROJ-5)', async () => {
      await open()

      const outcome = await open()

      expect(outcome._unsafeUnwrapErr().code).toBe('MISSION_ALREADY_OPEN')
      expect(escrow).toHaveBeenCalledOnce()
    })

    it('allows a new one once the first has ended', async () => {
      const first = (await open())._unsafeUnwrap()
      await useCase.close({ missionId: first.id, actorId: OWNER.value })

      expect((await open()).isOk()).toBe(true)
    })

    it.each([
      ['no slots', { slots: 0 }, 'MISSION_SLOTS_NOT_ALLOWED'],
      ['too many slots', { slots: MAX_SLOTS + 1 }, 'MISSION_SLOTS_NOT_ALLOWED'],
      ['fractional slots', { slots: 1.5 }, 'MISSION_SLOTS_NOT_ALLOWED'],
      ['no task', { taskText: '  ' }, 'MISSION_TASK_NOT_ALLOWED'],
      [
        'a long task',
        { taskText: 'x'.repeat(TASK_TEXT_MAX_LENGTH + 1) },
        'MISSION_TASK_NOT_ALLOWED',
      ],
      [
        'four questions',
        { questions: Array.from({ length: MAX_QUESTIONS + 1 }, () => 'why?') },
        'MISSION_QUESTIONS_NOT_ALLOWED',
      ],
      ['a long question', { questions: ['x'.repeat(201)] }, 'MISSION_QUESTIONS_NOT_ALLOWED'],
    ])('refuses %s before escrowing anything', async (_case, patch, code) => {
      const outcome = await open(patch)

      expect(outcome._unsafeUnwrapErr().code).toBe(code)
      expect(escrow).not.toHaveBeenCalled()
    })

    it('refuses a stranger', async () => {
      const outcome = await open({ actorId: STRANGER })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(escrow).not.toHaveBeenCalled()
    })

    it('refuses a project that has been hidden', async () => {
      const posted = await projects.findById(EntityId.parse(projectId)._unsafeUnwrap())
      posted?.softDelete()
      if (posted !== null && posted !== undefined) await projects.save(posted)

      expect((await open())._unsafeUnwrapErr().code).toBe('PROJECT_NOT_FOUND')
    })
  })

  describe('close (PROJ-6)', () => {
    let missionId: string

    beforeEach(async () => {
      missionId = (await open())._unsafeUnwrap().id
      refund.mockClear()
      cancel.mockClear()
    })

    it('refunds every slot nobody took (CRED-5)', async () => {
      const view = (await useCase.close({ missionId, actorId: OWNER.value }))._unsafeUnwrap()

      expect(view.state).toBe('closed')
      expect(view.openSlots).toBe(0)
      expect(refund).toHaveBeenCalledExactlyOnceWith({
        makerId: OWNER.value,
        missionId,
        credits: 3,
      })
    })

    it('leaves a held slot escrowed, refunding only the rest', async () => {
      occupancy.set(missionId, { held: 1, submitted: 0, settled: 0 })

      await useCase.close({ missionId, actorId: OWNER.value })

      expect(refund).toHaveBeenCalledExactlyOnceWith({
        makerId: OWNER.value,
        missionId,
        credits: 2,
      })
    })

    it('refunds nothing when every slot is spoken for', async () => {
      occupancy.set(missionId, { held: 1, submitted: 1, settled: 1 })

      await useCase.close({ missionId, actorId: OWNER.value })

      expect(refund).not.toHaveBeenCalled()
    })

    it('cancels the expiry timer, since there is nothing left for it to do', async () => {
      await useCase.close({ missionId, actorId: OWNER.value })

      expect(cancel).toHaveBeenCalledExactlyOnceWith(MISSION_EXPIRE_JOB, missionJobKey(missionId))
    })

    it('announces the ending, with what came back (for T030)', async () => {
      await useCase.close({ missionId, actorId: OWNER.value })

      const ended = missions.pulled.filter((event) => event instanceof MissionEnded)
      expect(ended).toHaveLength(1)
      expect(ended[0]).toMatchObject({ state: 'closed', refundedSlots: 3, projectId })
    })

    it('refuses a stranger', async () => {
      const outcome = await useCase.close({ missionId, actorId: STRANGER })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(refund).not.toHaveBeenCalled()
    })

    it('refuses to close one that has already ended', async () => {
      await useCase.close({ missionId, actorId: OWNER.value })

      const outcome = await useCase.close({ missionId, actorId: OWNER.value })

      expect(outcome._unsafeUnwrapErr().code).toBe('MISSION_NOT_OPEN')
    })

    it('is not found for a mission nobody opened', async () => {
      const outcome = await useCase.close({
        missionId: EntityId.generate().value,
        actorId: OWNER.value,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('MISSION_NOT_FOUND')
    })
  })

  describe('expire (PROJ-6)', () => {
    let missionId: string

    beforeEach(async () => {
      missionId = (await open())._unsafeUnwrap().id
      refund.mockClear()
    })

    it('ends it and hands back what nobody took', async () => {
      expect((await useCase.expire(missionId)).isOk()).toBe(true)

      expect(missions.rows.get(missionId)?.state).toBe('expired')
      expect(refund).toHaveBeenCalledExactlyOnceWith({
        makerId: OWNER.value,
        missionId,
        credits: 3,
      })
    })

    it('is a no-op the second time, which is what at-least-once delivery needs', async () => {
      await useCase.expire(missionId)
      refund.mockClear()

      expect((await useCase.expire(missionId)).isOk()).toBe(true)
      expect(refund).not.toHaveBeenCalled()
    })

    it('does nothing to a mission the maker already closed', async () => {
      await useCase.close({ missionId, actorId: OWNER.value })
      refund.mockClear()

      await useCase.expire(missionId)

      expect(missions.rows.get(missionId)?.state).toBe('closed')
      expect(refund).not.toHaveBeenCalled()
    })
  })

  describe('completeIfSettled (PROJ-6)', () => {
    let missionId: string

    beforeEach(async () => {
      missionId = (await open())._unsafeUnwrap().id
      cancel.mockClear()
    })

    it('completes it once every slot has settled', async () => {
      occupancy.set(missionId, { held: 0, submitted: 0, settled: 3 })

      await useCase.completeIfSettled(missionId)

      expect(missions.rows.get(missionId)?.state).toBe('completed')
      expect(cancel).toHaveBeenCalledExactlyOnceWith(MISSION_EXPIRE_JOB, missionJobKey(missionId))
    })

    it('waits while a slot is still outstanding', async () => {
      occupancy.set(missionId, { held: 1, submitted: 0, settled: 2 })

      await useCase.completeIfSettled(missionId)

      expect(missions.rows.get(missionId)?.state).toBe('open')
    })

    it('refunds nothing, because a completed mission handed everything out', async () => {
      occupancy.set(missionId, { held: 0, submitted: 0, settled: 3 })

      await useCase.completeIfSettled(missionId)

      expect(refund).not.toHaveBeenCalled()
    })

    it('leaves an already-ended mission alone', async () => {
      await useCase.close({ missionId, actorId: OWNER.value })
      occupancy.set(missionId, { held: 0, submitted: 0, settled: 3 })

      await useCase.completeIfSettled(missionId)

      expect(missions.rows.get(missionId)?.state).toBe('closed')
    })
  })
})
