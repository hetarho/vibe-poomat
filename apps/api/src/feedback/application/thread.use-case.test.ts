import { beforeEach, describe, expect, it } from 'vitest'
import type {
  MissionForClaim,
  MissionReader,
  SlotOccupancy,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { NO_OCCUPANCY } from '../../shared/application'
import { type DomainEvent, EntityId } from '../../shared/kernel'
import type { ClaimRepository } from '../domain/claim.repository'
import type { Feedback } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { FeedbackClaim, LIVE_CLAIM_STATES } from '../domain/feedback-claim'
import type { FeedbackReply } from '../domain/feedback-reply'
import { REPLY_MAX_LENGTH, ThreadReplied } from '../domain/feedback-reply'
import type { ReplyRepository, ThreadCursorKeys } from '../domain/reply.repository'
import { MIN_FIELD_LENGTH } from '../domain/report'
import { SubmitFeedbackUseCase } from './submit-feedback.use-case'
import { ThreadUseCase } from './thread.use-case'

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
    feedback.pullEvents()
  }
}

class InMemoryReplies implements ReplyRepository {
  readonly rows: FeedbackReply[] = []
  readonly pulled: DomainEvent[] = []

  async page(
    feedbackId: EntityId,
    options: { limit: number; after?: ThreadCursorKeys },
  ): Promise<FeedbackReply[]> {
    const after = options.after
    // the same total order the SQL asks for: the instant, then the id
    const compare = (
      left: { createdAt: Date; id: string },
      right: { createdAt: Date; id: string },
    ) => left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    const keysOf = (reply: FeedbackReply) => ({ createdAt: reply.createdAt, id: reply.id.value })

    return this.rows
      .filter((reply) => reply.feedbackId.equals(feedbackId))
      .sort((left, right) => compare(keysOf(left), keysOf(right)))
      .filter((reply) => after === undefined || compare(keysOf(reply), after) > 0)
      .slice(0, options.limit)
  }

  readonly anonymised = new Set<string>()

  async anonymiseAuthor(userId: EntityId): Promise<void> {
    this.anonymised.add(userId.value)
  }

  async save(reply: FeedbackReply): Promise<void> {
    this.rows.push(reply)
    this.pulled.push(...reply.pullEvents())
  }
}

const SUMMARIES = new Map<string, UserSummary>([
  [MAKER.value, { id: MAKER.value, handle: 'ada', displayName: 'Ada', avatarUrl: null }],
  [FEEDBACKER.value, { id: FEEDBACKER.value, handle: 'bob', displayName: 'Bob', avatarUrl: null }],
])

const users: UserSummaryReader = {
  summaryFor: async (userId) => SUMMARIES.get(userId) ?? null,
  summariesFor: async (userIds) =>
    new Map(
      userIds
        .map((id) => [id, SUMMARIES.get(id)] as const)
        .filter((entry): entry is [string, UserSummary] => entry[1] !== undefined),
    ),
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

describe('ThreadUseCase (FDBK-5)', () => {
  let feedbacks: InMemoryFeedbacks
  let replies: InMemoryReplies
  let useCase: ThreadUseCase
  let feedbackId: string

  beforeEach(async () => {
    const claims = new InMemoryClaims()
    feedbacks = new InMemoryFeedbacks()
    replies = new InMemoryReplies()

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

    useCase = new ThreadUseCase(feedbacks, replies, missions, users, passthroughTransactions)
  })

  function reply(actorId: string, body = 'thanks, that helps') {
    return useCase.reply({ feedbackId, actorId, body })
  }

  describe('who may write', () => {
    it('lets the maker in', async () => {
      const view = (await reply(MAKER.value))._unsafeUnwrap()

      expect(view.author?.handle).toBe('ada')
      expect(view.body).toBe('thanks, that helps')
    })

    it('lets the feedbacker in', async () => {
      expect((await reply(FEEDBACKER.value))._unsafeUnwrap().author?.handle).toBe('bob')
    })

    it('refuses everybody else, and writes nothing', async () => {
      const outcome = await reply(STRANGER.value)

      expect(outcome._unsafeUnwrapErr().code).toBe('NOT_A_THREAD_PARTICIPANT')
      expect(replies.rows).toHaveLength(0)
    })

    it('is not found for a report nobody wrote', async () => {
      const outcome = await useCase.reply({
        feedbackId: EntityId.generate().value,
        actorId: MAKER.value,
        body: 'hello',
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('FEEDBACK_NOT_FOUND')
    })
  })

  describe('the recipient it announces', () => {
    it('is the feedbacker when the maker wrote', async () => {
      await reply(MAKER.value)

      const [announced] = replies.pulled.filter((event) => event instanceof ThreadReplied)
      expect(announced).toMatchObject({
        authorId: MAKER.value,
        recipientId: FEEDBACKER.value,
      })
    })

    it('is the maker when the feedbacker wrote', async () => {
      await reply(FEEDBACKER.value)

      const [announced] = replies.pulled.filter((event) => event instanceof ThreadReplied)
      expect(announced).toMatchObject({
        authorId: FEEDBACKER.value,
        recipientId: MAKER.value,
      })
    })

    it('is always the other one, whoever writes', async () => {
      await reply(MAKER.value)
      await reply(FEEDBACKER.value)

      for (const event of replies.pulled.filter((each) => each instanceof ThreadReplied)) {
        expect(event.authorId).not.toBe(event.recipientId)
      }
    })
  })

  describe('what a reply may say', () => {
    it.each(['', '   '])('refuses %j', async (body) => {
      const outcome = await reply(MAKER.value, body)

      expect(outcome._unsafeUnwrapErr().code).toBe('VALIDATION_FAILED')
      expect(outcome._unsafeUnwrapErr().details).toMatchObject({ body: expect.any(Array) })
    })

    it('refuses one past the limit', async () => {
      const outcome = await reply(MAKER.value, 'a'.repeat(REPLY_MAX_LENGTH + 1))

      expect(outcome._unsafeUnwrapErr().code).toBe('VALIDATION_FAILED')
    })

    it('trims what it keeps', async () => {
      expect((await reply(MAKER.value, '  hello  '))._unsafeUnwrap().body).toBe('hello')
    })
  })

  describe('reading it', () => {
    it('walks oldest first, with a cursor rather than an offset', async () => {
      await reply(MAKER.value, 'first')
      await reply(FEEDBACKER.value, 'second')
      await reply(MAKER.value, 'third')

      const page = (await useCase.read({ feedbackId, limit: 2 }))._unsafeUnwrap()
      expect(page.items.map((item) => item.body)).toEqual(['first', 'second'])
      expect(page.nextCursor).not.toBeNull()

      const rest = (
        await useCase.read({ feedbackId, limit: 2, cursor: page.nextCursor ?? undefined })
      )._unsafeUnwrap()
      expect(rest.items.map((item) => item.body)).toEqual(['third'])
      expect(rest.nextCursor).toBeNull()
    })

    it('is empty for a thread nobody has written in', async () => {
      const page = (await useCase.read({ feedbackId }))._unsafeUnwrap()

      expect(page).toEqual({ items: [], nextCursor: null })
    })

    it('is not found for a report nobody wrote', async () => {
      const outcome = await useCase.read({ feedbackId: EntityId.generate().value })

      expect(outcome._unsafeUnwrapErr().code).toBe('FEEDBACK_NOT_FOUND')
    })

    it.each(['not-base64url-at-all', Buffer.from('1.2.3').toString('base64url')])(
      'refuses a cursor a caller made up: %j',
      async (cursor) => {
        const outcome = await useCase.read({ feedbackId, cursor })

        expect(outcome._unsafeUnwrapErr().code).toBe('THREAD_CURSOR_NOT_ALLOWED')
      },
    )
  })
})
