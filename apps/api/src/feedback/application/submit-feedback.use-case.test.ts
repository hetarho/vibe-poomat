import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  JobScheduler,
  MissionForClaim,
  MissionReader,
  SlotOccupancy,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { NO_OCCUPANCY } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import type { ClaimRepository } from '../domain/claim.repository'
import type { Feedback } from '../domain/feedback'
import { FeedbackSubmitted } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { CLAIM_HOLD_MS, FeedbackClaim, LIVE_CLAIM_STATES } from '../domain/feedback-claim'
import { MIN_FIELD_LENGTH } from '../domain/report'
import { claimJobKey, SLOT_RELEASE_JOB } from './claim-slot.use-case'
import { ReadFeedbackUseCase } from './read-feedback.use-case'
import {
  AUTO_ACCEPT_AFTER_MS,
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  SubmitFeedbackUseCase,
  WARN_AFTER_MS,
} from './submit-feedback.use-case'

const MISSION = EntityId.generate()
const PROJECT = EntityId.generate()
const MAKER = EntityId.generate()
const FEEDBACKER = EntityId.generate()
const STRANGER = EntityId.generate()

const ENOUGH = 'a'.repeat(MIN_FIELD_LENGTH)
const TOO_SHORT = 'a'.repeat(MIN_FIELD_LENGTH - 1)

class InMemoryClaims implements ClaimRepository {
  readonly rows = new Map<string, FeedbackClaim>()

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

  async lockOccupancy(): Promise<SlotOccupancy> {
    return NO_OCCUPANCY
  }

  async occupancyFor(): Promise<SlotOccupancy> {
    return NO_OCCUPANCY
  }

  async occupancyForMany(): Promise<Map<string, SlotOccupancy>> {
    return new Map()
  }

  async listHeldBy(userId: EntityId): Promise<FeedbackClaim[]> {
    return [...this.rows.values()].filter(
      (claim) => claim.userId.equals(userId) && claim.state === 'held',
    )
  }

  async save(claim: FeedbackClaim): Promise<void> {
    this.rows.set(claim.id.value, claim)
  }
}

class InMemoryFeedbacks implements FeedbackRepository {
  readonly rows = new Map<string, Feedback>()
  readonly pulled: { name: string }[] = []

  async findById(id: EntityId): Promise<Feedback | null> {
    return this.rows.get(id.value) ?? null
  }

  async findByClaimId(claimId: EntityId): Promise<Feedback | null> {
    for (const feedback of this.rows.values()) {
      if (feedback.claimId.equals(claimId)) return feedback
    }

    return null
  }

  async listForMission(missionId: EntityId): Promise<Feedback[]> {
    return [...this.rows.values()].filter((feedback) => feedback.missionId.equals(missionId))
  }

  async listForAuthor(
    authorId: EntityId,
    options: { limit: number; before?: string },
  ): Promise<Feedback[]> {
    return [...this.rows.values()]
      .filter((feedback) => feedback.authorId?.equals(authorId) === true)
      .sort((left, right) => right.id.value.localeCompare(left.id.value))
      .filter((feedback) => options.before === undefined || feedback.id.value < options.before)
      .slice(0, options.limit)
  }

  readonly anonymised = new Set<string>()

  async listPendingForMaker(makerId: EntityId): Promise<Feedback[]> {
    return [...this.rows.values()].filter(
      (feedback) => feedback.makerId.equals(makerId) && feedback.state === 'pending',
    )
  }

  async anonymiseAuthor(userId: EntityId): Promise<void> {
    this.anonymised.add(userId.value)
  }

  async save(feedback: Feedback): Promise<void> {
    this.rows.set(feedback.id.value, feedback)
    this.pulled.push(...feedback.pullEvents())
  }
}

const AUTHOR: UserSummary = {
  id: FEEDBACKER.value,
  handle: 'bob',
  displayName: 'Bob',
  avatarUrl: null,
}

const users: UserSummaryReader = {
  summaryFor: async (userId) => (userId === FEEDBACKER.value ? AUTHOR : null),
  summariesFor: async (userIds) =>
    new Map(userIds.filter((id) => id === FEEDBACKER.value).map((id) => [id, AUTHOR])),
}

describe('SubmitFeedbackUseCase', () => {
  let claims: InMemoryClaims
  let feedbacks: InMemoryFeedbacks
  let mission: MissionForClaim
  let missions: MissionReader
  let schedule: ReturnType<typeof vi.fn>
  let cancel: ReturnType<typeof vi.fn>
  let jobs: JobScheduler
  let useCase: SubmitFeedbackUseCase
  let claimId: string

  beforeEach(async () => {
    claims = new InMemoryClaims()
    feedbacks = new InMemoryFeedbacks()
    mission = {
      id: MISSION.value,
      projectId: PROJECT.value,
      ownerId: MAKER.value,
      slots: 2,
      questions: [],
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

    useCase = new SubmitFeedbackUseCase(claims, feedbacks, missions, users, jobs, {
      run: async <T>(work: () => Promise<T>): Promise<T> => work(),
    })

    const claim = FeedbackClaim.hold({ missionId: MISSION, userId: FEEDBACKER })
    await claims.save(claim)
    claimId = claim.id.value
  })

  function report(overrides: Record<string, unknown> = {}) {
    return {
      firstImpression: ENOUGH,
      stuckAt: ENOUGH,
      wouldPay: true,
      wouldPayReason: ENOUGH,
      suggestion: ENOUGH,
      answers: [] as string[],
      ...overrides,
    }
  }

  function submit(overrides: Record<string, unknown> = {}, actorId = FEEDBACKER.value) {
    return useCase.execute({ claimId, actorId, report: report(overrides) })
  }

  describe('submitting (FDBK-3)', () => {
    it('writes the report and moves the slot on', async () => {
      const view = (await submit())._unsafeUnwrap()

      expect(view.state).toBe('pending')
      expect(view.author?.handle).toBe('bob')
      expect(view.projectId).toBe(PROJECT.value)
      expect(claims.rows.get(claimId)?.state).toBe('submitted')
    })

    it('cancels the release timer, because the slot is spoken for', async () => {
      await submit()

      expect(cancel).toHaveBeenCalledExactlyOnceWith(SLOT_RELEASE_JOB, claimJobKey(claimId))
    })

    it("starts FDBK-7's two deadlines at their absolute instants", async () => {
      const view = (await submit())._unsafeUnwrap()
      const submittedAt = view.submittedAt.getTime()

      expect(schedule).toHaveBeenCalledTimes(2)
      expect(schedule).toHaveBeenCalledWith(
        FEEDBACK_WARN_JOB,
        { feedbackId: view.id },
        new Date(submittedAt + WARN_AFTER_MS),
        expect.anything(),
      )
      expect(schedule).toHaveBeenCalledWith(
        FEEDBACK_AUTO_ACCEPT_JOB,
        { feedbackId: view.id },
        new Date(submittedAt + AUTO_ACCEPT_AFTER_MS),
        expect.anything(),
      )
    })

    it('announces the submission, naming both sides', async () => {
      await submit()

      const submitted = feedbacks.pulled.filter((event) => event instanceof FeedbackSubmitted)
      expect(submitted).toHaveLength(1)
      expect(submitted[0]).toMatchObject({
        makerId: MAKER.value,
        feedbackerId: FEEDBACKER.value,
      })
    })

    it('takes one answer per mission question', async () => {
      mission = { ...mission, questions: ['Was it clear?'] }

      const view = (await submit({ answers: [ENOUGH] }))._unsafeUnwrap()

      expect(view.answers).toEqual([ENOUGH])
    })
  })

  describe('what it refuses', () => {
    it('a field one character short, naming that field (FDBK-10)', async () => {
      const outcome = await submit({ stuckAt: TOO_SHORT })

      expect(outcome._unsafeUnwrapErr().code).toBe('VALIDATION_FAILED')
      expect(outcome._unsafeUnwrapErr().details).toMatchObject({ stuckAt: expect.any(Array) })
      expect(feedbacks.rows.size).toBe(0)
    })

    it('a missing answer', async () => {
      mission = { ...mission, questions: ['Was it clear?'] }

      const outcome = await submit({ answers: [] })

      expect(outcome._unsafeUnwrapErr().details).toMatchObject({ answers: expect.any(Array) })
    })

    it('somebody who does not hold the slot', async () => {
      const outcome = await submit({}, STRANGER.value)

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(feedbacks.rows.size).toBe(0)
    })

    it('a hold that ran out (FDBK-1)', async () => {
      vi.setSystemTime(new Date(Date.now() + CLAIM_HOLD_MS + 1000))

      const outcome = await submit()

      expect(outcome._unsafeUnwrapErr().code).toBe('CLAIM_EXPIRED')
      vi.useRealTimers()
    })

    it('a slot that was already submitted (FDBK-4)', async () => {
      await submit()

      const outcome = await submit()

      expect(outcome._unsafeUnwrapErr().code).toBe('CLAIM_NOT_HELD')
    })

    it('a claim nobody made', async () => {
      const outcome = await useCase.execute({
        claimId: EntityId.generate().value,
        actorId: FEEDBACKER.value,
        report: report(),
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('CLAIM_NOT_FOUND')
    })

    it('a mission the reader cannot find', async () => {
      missions = { forClaim: async () => null }
      useCase = new SubmitFeedbackUseCase(claims, feedbacks, missions, users, jobs, {
        run: async <T>(work: () => Promise<T>): Promise<T> => work(),
      })

      expect((await submit())._unsafeUnwrapErr().code).toBe('MISSION_NOT_OPEN')
    })
  })
})

describe('ReadFeedbackUseCase (FDBK-9)', () => {
  let feedbacks: InMemoryFeedbacks
  let useCase: ReadFeedbackUseCase

  beforeEach(async () => {
    feedbacks = new InMemoryFeedbacks()
    useCase = new ReadFeedbackUseCase(feedbacks, users)
  })

  /** Writes one through the real submit path, which is the only way one exists. */
  async function write(): Promise<string> {
    const claims = new InMemoryClaims()
    const claim = FeedbackClaim.hold({ missionId: MISSION, userId: FEEDBACKER })
    await claims.save(claim)
    const submitter = new SubmitFeedbackUseCase(
      claims,
      feedbacks,
      {
        forClaim: async () => ({
          id: MISSION.value,
          projectId: PROJECT.value,
          ownerId: MAKER.value,
          slots: 1,
          questions: [],
          isOpen: true,
        }),
      },
      users,
      {
        enqueue: async () => undefined,
        schedule: async () => undefined,
        cancel: async () => undefined,
      },
      { run: async <T>(work: () => Promise<T>): Promise<T> => work() },
    )
    const view = (
      await submitter.execute({
        claimId: claim.id.value,
        actorId: FEEDBACKER.value,
        report: {
          firstImpression: ENOUGH,
          stuckAt: ENOUGH,
          wouldPay: true,
          wouldPayReason: ENOUGH,
          suggestion: ENOUGH,
          answers: [],
        },
      })
    )._unsafeUnwrap()

    return view.id
  }

  it('answers with the report and who wrote it', async () => {
    const id = await write()

    const view = (await useCase.byId(id))._unsafeUnwrap()

    expect(view.author?.handle).toBe('bob')
    expect(view.state).toBe('pending')
  })

  it('is not found for a report nobody wrote', async () => {
    expect((await useCase.byId(EntityId.generate().value))._unsafeUnwrapErr().code).toBe(
      'FEEDBACK_NOT_FOUND',
    )
  })

  it('is not found for something that is not an id', async () => {
    expect((await useCase.byId('nope'))._unsafeUnwrapErr().code).toBe('FEEDBACK_NOT_FOUND')
  })

  it('lists what a mission received', async () => {
    await write()

    expect(await useCase.forMission(MISSION.value)).toHaveLength(1)
  })

  it('lists nothing for something that is not a mission id', async () => {
    expect(await useCase.forMission('nope')).toEqual([])
  })
})
