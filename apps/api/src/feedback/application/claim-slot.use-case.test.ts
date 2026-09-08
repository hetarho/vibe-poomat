import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  JobScheduler,
  MissionForClaim,
  MissionReader,
  SlotOccupancy,
} from '../../shared/application'
import { NO_OCCUPANCY } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import type { ClaimRepository } from '../domain/claim.repository'
import {
  CLAIM_HOLD_MS,
  ClaimHeld,
  ClaimReleased,
  type FeedbackClaim,
  LIVE_CLAIM_STATES,
} from '../domain/feedback-claim'
import { ClaimSlotUseCase, claimJobKey, SLOT_RELEASE_JOB } from './claim-slot.use-case'

const MISSION = EntityId.generate().value
const OWNER = EntityId.generate().value
const FEEDBACKER = EntityId.generate().value
const OTHER = EntityId.generate().value

/** The same rules the table enforces, in memory. */
class InMemoryClaims implements ClaimRepository {
  readonly rows = new Map<string, FeedbackClaim>()
  readonly pulled: { name: string }[] = []
  locked = 0

  async findById(id: EntityId): Promise<FeedbackClaim | null> {
    return this.rows.get(id.value) ?? null
  }

  async findLiveFor(missionId: EntityId, userId: EntityId): Promise<FeedbackClaim | null> {
    for (const claim of this.rows.values()) {
      if (
        claim.missionId.equals(missionId) &&
        claim.userId.equals(userId) &&
        LIVE_CLAIM_STATES.includes(claim.state)
      ) {
        return claim
      }
    }

    return null
  }

  async lockOccupancy(missionId: EntityId): Promise<SlotOccupancy> {
    this.locked += 1

    return this.occupancyFor(missionId.value)
  }

  async occupancyFor(missionId: string): Promise<SlotOccupancy> {
    const occupancy = { ...NO_OCCUPANCY }
    for (const claim of this.rows.values()) {
      if (claim.missionId.value !== missionId) continue
      if (claim.state === 'held') occupancy.held += 1
      if (claim.state === 'submitted') occupancy.submitted += 1
      if (claim.state === 'settled') occupancy.settled += 1
    }

    return occupancy
  }

  async occupancyForMany(missionIds: readonly string[]): Promise<Map<string, SlotOccupancy>> {
    const all = new Map<string, SlotOccupancy>()
    for (const missionId of missionIds) all.set(missionId, await this.occupancyFor(missionId))

    return all
  }

  async save(claim: FeedbackClaim): Promise<void> {
    this.rows.set(claim.id.value, claim)
    this.pulled.push(...claim.pullEvents())
  }
}

describe('ClaimSlotUseCase', () => {
  let claims: InMemoryClaims
  let mission: MissionForClaim
  let missions: MissionReader
  let schedule: ReturnType<typeof vi.fn>
  let cancel: ReturnType<typeof vi.fn>
  let jobs: JobScheduler
  let useCase: ClaimSlotUseCase

  beforeEach(() => {
    claims = new InMemoryClaims()
    mission = {
      id: MISSION,
      projectId: EntityId.generate().value,
      ownerId: OWNER,
      slots: 2,
      isOpen: true,
    }
    missions = { forClaim: async () => mission }

    schedule = vi.fn(async () => undefined)
    cancel = vi.fn(async () => undefined)
    jobs = {
      enqueue: async () => undefined,
      schedule: schedule as unknown as JobScheduler['schedule'],
      cancel: cancel as unknown as JobScheduler['cancel'],
    }

    useCase = new ClaimSlotUseCase(claims, missions, jobs, {
      run: async <T>(work: () => Promise<T>): Promise<T> => work(),
    })
  })

  function claim(actorId = FEEDBACKER) {
    return useCase.claim({ missionId: MISSION, actorId })
  }

  describe('claiming (FDBK-1)', () => {
    it('holds the slot for a day', async () => {
      const view = (await claim())._unsafeUnwrap()

      expect(view.state).toBe('held')
      expect(view.heldUntil.getTime() - view.createdAt.getTime()).toBe(CLAIM_HOLD_MS)
    })

    it('schedules the release for the moment the hold runs out', async () => {
      const view = (await claim())._unsafeUnwrap()

      expect(schedule).toHaveBeenCalledExactlyOnceWith(
        SLOT_RELEASE_JOB,
        { claimId: view.id },
        view.heldUntil,
        { singletonKey: claimJobKey(view.id) },
      )
    })

    it('announces the hold, for the slot accounting that reads it', async () => {
      await claim()

      expect(claims.pulled.filter((event) => event instanceof ClaimHeld)).toHaveLength(1)
    })

    it('serialises on the mission before counting anything', async () => {
      await claim()

      expect(claims.locked).toBe(1)
    })

    it('refuses a mission that has ended', async () => {
      mission = { ...mission, isOpen: false }

      expect((await claim())._unsafeUnwrapErr().code).toBe('MISSION_NOT_OPEN')
    })

    it('refuses a mission nobody opened', async () => {
      missions = { forClaim: async () => null }
      useCase = new ClaimSlotUseCase(claims, missions, jobs, {
        run: async <T>(work: () => Promise<T>): Promise<T> => work(),
      })

      expect((await claim())._unsafeUnwrapErr().code).toBe('MISSION_NOT_OPEN')
    })

    it('refuses the maker their own project (FDBK-2)', async () => {
      expect((await claim(OWNER))._unsafeUnwrapErr().code).toBe('OWN_PROJECT')
      expect(claims.rows.size).toBe(0)
    })

    it('refuses a second live claim by the same account (FDBK-2)', async () => {
      await claim()

      expect((await claim())._unsafeUnwrapErr().code).toBe('ALREADY_CLAIMED')
      expect(claims.rows.size).toBe(1)
    })

    it('refuses when every slot is taken', async () => {
      await claim(FEEDBACKER)
      await claim(OTHER)

      const third = await useCase.claim({ missionId: MISSION, actorId: EntityId.generate().value })

      expect(third._unsafeUnwrapErr().code).toBe('NO_SLOTS_AVAILABLE')
    })

    it('counts a submitted slot as taken, not as free', async () => {
      const held = (await claim())._unsafeUnwrap()
      const stored = await claims.findById(EntityId.parse(held.id)._unsafeUnwrap())
      stored?.submit()
      if (stored !== null && stored !== undefined) await claims.save(stored)

      await claim(OTHER)
      const third = await useCase.claim({ missionId: MISSION, actorId: EntityId.generate().value })

      expect(third._unsafeUnwrapErr().code).toBe('NO_SLOTS_AVAILABLE')
    })
  })

  describe('releasing by hand (FDBK-1)', () => {
    it('gives the slot back and cancels the timer', async () => {
      const view = (await claim())._unsafeUnwrap()
      cancel.mockClear()

      expect((await useCase.release({ claimId: view.id, actorId: FEEDBACKER })).isOk()).toBe(true)

      expect((await claims.findById(EntityId.parse(view.id)._unsafeUnwrap()))?.state).toBe(
        'released',
      )
      expect(cancel).toHaveBeenCalledExactlyOnceWith(SLOT_RELEASE_JOB, claimJobKey(view.id))
    })

    it('lets the same person claim again afterwards, with no re-claim limit', async () => {
      const view = (await claim())._unsafeUnwrap()
      await useCase.release({ claimId: view.id, actorId: FEEDBACKER })

      expect((await claim()).isOk()).toBe(true)
    })

    it('announces the release, saying it was not the clock', async () => {
      const view = (await claim())._unsafeUnwrap()
      claims.pulled.length = 0

      await useCase.release({ claimId: view.id, actorId: FEEDBACKER })

      const released = claims.pulled.filter((event) => event instanceof ClaimReleased)
      expect(released).toHaveLength(1)
      expect(released[0]).toMatchObject({ expired: false })
    })

    it('refuses somebody else the slot', async () => {
      const view = (await claim())._unsafeUnwrap()

      const outcome = await useCase.release({ claimId: view.id, actorId: OTHER })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
    })

    it('is not found for a claim nobody made', async () => {
      const outcome = await useCase.release({
        claimId: EntityId.generate().value,
        actorId: FEEDBACKER,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('CLAIM_NOT_FOUND')
    })

    it('refuses to release one that has already been submitted', async () => {
      const view = (await claim())._unsafeUnwrap()
      const stored = await claims.findById(EntityId.parse(view.id)._unsafeUnwrap())
      stored?.submit()
      if (stored !== null && stored !== undefined) await claims.save(stored)

      const outcome = await useCase.release({ claimId: view.id, actorId: FEEDBACKER })

      expect(outcome._unsafeUnwrapErr().code).toBe('CLAIM_NOT_HELD')
    })
  })

  describe('the release job', () => {
    it('does nothing while the hold still stands', async () => {
      const view = (await claim())._unsafeUnwrap()

      await useCase.releaseIfLapsed(view.id)

      expect((await claims.findById(EntityId.parse(view.id)._unsafeUnwrap()))?.state).toBe('held')
    })

    it('gives the slot back once the day has run out', async () => {
      const view = (await claim())._unsafeUnwrap()
      const stored = await claims.findById(EntityId.parse(view.id)._unsafeUnwrap())
      vi.setSystemTime(new Date(Date.now() + CLAIM_HOLD_MS + 1000))

      await useCase.releaseIfLapsed(view.id)

      expect(stored?.state).toBe('released')
      vi.useRealTimers()
    })

    it('is a no-op the second time, which is what at-least-once delivery needs', async () => {
      const view = (await claim())._unsafeUnwrap()
      vi.setSystemTime(new Date(Date.now() + CLAIM_HOLD_MS + 1000))
      await useCase.releaseIfLapsed(view.id)
      claims.pulled.length = 0

      expect((await useCase.releaseIfLapsed(view.id)).isOk()).toBe(true)
      expect(claims.pulled).toEqual([])
      vi.useRealTimers()
    })

    it('leaves a submitted claim alone, however long it has been', async () => {
      const view = (await claim())._unsafeUnwrap()
      const stored = await claims.findById(EntityId.parse(view.id)._unsafeUnwrap())
      stored?.submit()
      if (stored !== null && stored !== undefined) await claims.save(stored)
      vi.setSystemTime(new Date(Date.now() + CLAIM_HOLD_MS + 1000))

      await useCase.releaseIfLapsed(view.id)

      expect(stored?.state).toBe('submitted')
      vi.useRealTimers()
    })
  })
})
