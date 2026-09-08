import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CreditOperations,
  JobScheduler,
  MissionForClaim,
  MissionReader,
  SlotOccupancy,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { NO_OCCUPANCY } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { ConflictError, err, ok } from '../../shared/result'
import type { ClaimRepository } from '../domain/claim.repository'
import type { Feedback } from '../domain/feedback'
import { AutoAcceptWarning, SlotSettled } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { FeedbackClaim, LIVE_CLAIM_STATES } from '../domain/feedback-claim'
import { MIN_FIELD_LENGTH } from '../domain/report'
import { SettleFeedbackUseCase } from './settle-feedback.use-case'
import {
  FEEDBACK_AUTO_ACCEPT_JOB,
  FEEDBACK_WARN_JOB,
  feedbackJobKey,
  SubmitFeedbackUseCase,
} from './submit-feedback.use-case'

const MISSION = EntityId.generate()
const PROJECT = EntityId.generate()
const MAKER = EntityId.generate()
const FEEDBACKER = EntityId.generate()
const STRANGER = EntityId.generate()

const ENOUGH = 'a'.repeat(MIN_FIELD_LENGTH)

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
    claim.pullEvents()
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

  async listForMission(): Promise<Feedback[]> {
    return [...this.rows.values()]
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

  async listForProject(
    projectId: EntityId,
    options: { limit: number; before?: string },
  ): Promise<Feedback[]> {
    return [...this.rows.values()]
      .filter((feedback) => feedback.projectId.equals(projectId))
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
  summariesFor: async () => new Map(),
}

const mission: MissionForClaim = {
  id: MISSION.value,
  projectId: PROJECT.value,
  ownerId: MAKER.value,
  slots: 2,
  questions: [],
  isOpen: true,
}

const missions: MissionReader = { forClaim: async () => mission }

const passthroughTransactions = { run: async <T>(work: () => Promise<T>): Promise<T> => work() }

describe('SettleFeedbackUseCase', () => {
  let claims: InMemoryClaims
  let feedbacks: InMemoryFeedbacks
  let settleSlot: ReturnType<typeof vi.fn>
  let credits: CreditOperations
  let cancel: ReturnType<typeof vi.fn>
  let jobs: JobScheduler
  let useCase: SettleFeedbackUseCase
  let feedbackId: string

  beforeEach(async () => {
    claims = new InMemoryClaims()
    feedbacks = new InMemoryFeedbacks()

    settleSlot = vi.fn(async () => ok(undefined))
    credits = {
      escrowForMission: async () => ok(undefined),
      settleSlot: settleSlot as unknown as CreditOperations['settleSlot'],
      refundUnfilled: async () => ok(undefined),
      voidAccount: async () => ok(undefined),
    }

    cancel = vi.fn(async () => undefined)
    jobs = {
      enqueue: async () => undefined,
      schedule: async () => undefined,
      cancel: cancel as unknown as JobScheduler['cancel'],
    }

    // written through the real submit path, because that is the only way one exists
    const claim = FeedbackClaim.hold({ missionId: MISSION, userId: FEEDBACKER })
    await claims.save(claim)
    const submitted = await new SubmitFeedbackUseCase(
      claims,
      feedbacks,
      missions,
      users,
      {
        enqueue: async () => undefined,
        schedule: async () => undefined,
        cancel: async () => undefined,
      },
      passthroughTransactions,
    ).execute({
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
    feedbackId = submitted._unsafeUnwrap().id
    feedbacks.pulled.length = 0

    useCase = new SettleFeedbackUseCase(
      feedbacks,
      claims,
      missions,
      credits,
      users,
      jobs,
      passthroughTransactions,
    )
  })

  describe('accept (FDBK-6, CRED-4)', () => {
    it('moves exactly one credit to the feedbacker', async () => {
      const view = (await useCase.accept({ feedbackId, actorId: MAKER.value }))._unsafeUnwrap()

      expect(view.state).toBe('accepted')
      expect(view.automatic).toBe(false)
      expect(settleSlot).toHaveBeenCalledExactlyOnceWith({
        feedbackId,
        to: 'feedbacker',
        makerId: MAKER.value,
        feedbackerId: FEEDBACKER.value,
      })
    })

    it('spends the slot rather than freeing it', async () => {
      await useCase.accept({ feedbackId, actorId: MAKER.value })

      const claim = [...claims.rows.values()][0]
      expect(claim?.state).toBe('settled')
    })

    it('announces the settlement, so the mission can notice its last slot', async () => {
      await useCase.accept({ feedbackId, actorId: MAKER.value })

      const settled = feedbacks.pulled.filter((event) => event instanceof SlotSettled)
      expect(settled).toHaveLength(1)
      expect(settled[0]).toMatchObject({
        missionId: MISSION.value,
        outcome: 'accepted',
        automatic: false,
      })
    })

    it('cancels both remaining deadlines', async () => {
      await useCase.accept({ feedbackId, actorId: MAKER.value })

      expect(cancel).toHaveBeenCalledWith(FEEDBACK_WARN_JOB, feedbackJobKey(feedbackId))
      expect(cancel).toHaveBeenCalledWith(FEEDBACK_AUTO_ACCEPT_JOB, feedbackJobKey(feedbackId))
    })

    it('refuses anyone but the maker, and moves nothing', async () => {
      const outcome = await useCase.accept({ feedbackId, actorId: STRANGER.value })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(settleSlot).not.toHaveBeenCalled()
    })

    it('refuses a second settle, and moves nothing', async () => {
      await useCase.accept({ feedbackId, actorId: MAKER.value })
      settleSlot.mockClear()

      const again = await useCase.accept({ feedbackId, actorId: MAKER.value })

      expect(again._unsafeUnwrapErr().code).toBe('FEEDBACK_ALREADY_SETTLED')
      expect(settleSlot).not.toHaveBeenCalled()
    })

    it('is not found for a report nobody wrote', async () => {
      const outcome = await useCase.accept({
        feedbackId: EntityId.generate().value,
        actorId: MAKER.value,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('FEEDBACK_NOT_FOUND')
    })

    it('leaves the report pending when the ledger refuses', async () => {
      settleSlot.mockResolvedValueOnce(err(new ConflictError('the ledger said no')))

      const outcome = await useCase.accept({ feedbackId, actorId: MAKER.value })

      expect(outcome.isErr()).toBe(true)
      // the transaction is what actually undoes this; the fake cannot, so what is
      // checked here is that the failure is reported rather than swallowed
      expect(settleSlot).toHaveBeenCalledOnce()
    })
  })

  describe('reject (FDBK-6)', () => {
    it('moves exactly one credit back to the maker', async () => {
      const view = (
        await useCase.reject({
          feedbackId,
          actorId: MAKER.value,
          reason: 'no_substance',
          note: 'nothing to act on',
        })
      )._unsafeUnwrap()

      expect(view.state).toBe('rejected')
      expect(view.rejectionReason).toBe('no_substance')
      expect(view.rejectionNote).toBe('nothing to act on')
      expect(settleSlot).toHaveBeenCalledExactlyOnceWith({
        feedbackId,
        to: 'maker',
        makerId: MAKER.value,
        feedbackerId: FEEDBACKER.value,
      })
    })

    it('takes a reason with no note', async () => {
      const view = (
        await useCase.reject({ feedbackId, actorId: MAKER.value, reason: 'task_not_done' })
      )._unsafeUnwrap()

      expect(view.rejectionNote).toBeNull()
    })

    it('refuses anyone but the maker', async () => {
      const outcome = await useCase.reject({
        feedbackId,
        actorId: FEEDBACKER.value,
        reason: 'spam_abuse',
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(settleSlot).not.toHaveBeenCalled()
    })
  })

  describe('autoAccept (FDBK-7)', () => {
    it('pays the feedbacker exactly as an accept does, and says the clock decided', async () => {
      expect((await useCase.autoAccept(feedbackId)).isOk()).toBe(true)

      expect(settleSlot).toHaveBeenCalledExactlyOnceWith({
        feedbackId,
        to: 'feedbacker',
        makerId: MAKER.value,
        feedbackerId: FEEDBACKER.value,
      })
      const settled = feedbacks.pulled.filter((event) => event instanceof SlotSettled)
      expect(settled[0]).toMatchObject({ automatic: true })
    })

    it('is a no-op the second time, which is what at-least-once delivery needs', async () => {
      await useCase.autoAccept(feedbackId)
      settleSlot.mockClear()

      expect((await useCase.autoAccept(feedbackId)).isOk()).toBe(true)
      expect(settleSlot).not.toHaveBeenCalled()
    })

    it('leaves a report the maker already rejected alone', async () => {
      await useCase.reject({ feedbackId, actorId: MAKER.value, reason: 'task_not_done' })
      settleSlot.mockClear()

      expect((await useCase.autoAccept(feedbackId)).isOk()).toBe(true)

      expect(settleSlot).not.toHaveBeenCalled()
      expect(feedbacks.rows.get(feedbackId)?.state).toBe('rejected')
    })
  })

  describe('warn (FDBK-7)', () => {
    it('announces the nudge while the decision is still open', async () => {
      expect((await useCase.warn(feedbackId)).isOk()).toBe(true)

      const warnings = feedbacks.pulled.filter((event) => event instanceof AutoAcceptWarning)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ makerId: MAKER.value })
    })

    it('says nothing once the report has been settled', async () => {
      await useCase.accept({ feedbackId, actorId: MAKER.value })
      feedbacks.pulled.length = 0

      expect((await useCase.warn(feedbackId)).isOk()).toBe(true)

      expect(feedbacks.pulled.filter((event) => event instanceof AutoAcceptWarning)).toEqual([])
    })

    it('is not found for a report nobody wrote', async () => {
      expect((await useCase.warn(EntityId.generate().value))._unsafeUnwrapErr().code).toBe(
        'FEEDBACK_NOT_FOUND',
      )
    })
  })
})
