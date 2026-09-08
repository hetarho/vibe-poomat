import type {
  MissionReader,
  TransactionManager,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ForbiddenError, ok, type Result } from '../../shared/result'
import { FeedbackNotFoundError, MissionNotOpenError } from '../domain/claim-errors'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { FeedbackReply, type ReplyBodyNotAllowedError } from '../domain/feedback-reply'
import type { ReplyRepository } from '../domain/reply.repository'
import {
  decodeThreadCursor,
  encodeThreadCursor,
  type ThreadCursorNotAllowedError,
} from './thread-cursor'

export const THREAD_PAGE_SIZE = 50
const MAX_THREAD_PAGE_SIZE = 100

/** FDBK-5: everyone reads, two people write. */
export class NotAThreadParticipantError extends ForbiddenError {
  override readonly code = 'NOT_A_THREAD_PARTICIPANT'
}

export type ThreadError =
  | FeedbackNotFoundError
  | NotAThreadParticipantError
  | ReplyBodyNotAllowedError
  | ThreadCursorNotAllowedError
  | MissionNotOpenError
  | ForbiddenError

export type ReplyView = {
  id: string
  feedbackId: string
  /** Null once the account is gone (AUTH-9), rendered as a deleted user. */
  author: UserSummary | null
  body: string
  createdAt: Date
}

export type ThreadView = {
  items: ReplyView[]
  nextCursor: string | null
}

/**
 * FDBK-5's thread. The two participants are resolved per request from rows that
 * already exist — the report's author and the project owner — because the pair
 * is fixed for the life of the thread and a participants table would be a second
 * copy of a fact that cannot change.
 *
 * FDBK-5 sets no window, so a settled report is still a thread: the conversation
 * about a rejection is exactly the one worth having.
 */
export class ThreadUseCase {
  constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly replies: ReplyRepository,
    private readonly missions: MissionReader,
    private readonly users: UserSummaryReader,
    private readonly transactions: TransactionManager,
  ) {}

  async reply(input: {
    feedbackId: string
    actorId: string
    body: string
  }): Promise<Result<ReplyView, ThreadError>> {
    const feedbackId = EntityId.parse(input.feedbackId)
    if (feedbackId.isErr()) return err(new FeedbackNotFoundError('no such feedback'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const feedback = await this.feedbacks.findById(feedbackId.value)
    if (feedback === null) return err(new FeedbackNotFoundError('no such feedback'))

    const mission = await this.missions.forClaim(feedback.missionId.value)
    if (mission === null) return err(new MissionNotOpenError('no such mission'))

    const maker = EntityId.parse(mission.ownerId)
    if (maker.isErr()) throw new Error(`the mission reader returned an unusable owner id`)

    // the other participant is whichever of the two the author is not
    const author = actorId.value
    const recipient = author.equals(maker.value) ? feedback.authorId : maker.value
    const isParticipant = author.equals(maker.value) || (feedback.authorId?.equals(author) ?? false)
    if (!isParticipant || recipient === null) {
      return err(new NotAThreadParticipantError('only the maker and the feedbacker can reply here'))
    }

    const posted = FeedbackReply.post({
      feedbackId: feedback.id,
      authorId: author,
      recipientId: recipient,
      body: input.body,
    })
    if (posted.isErr()) return err(posted.error)

    return this.transactions.run(async () => {
      await this.replies.save(posted.value)

      return ok({
        id: posted.value.id.value,
        feedbackId: feedback.id.value,
        author: await this.users.summaryFor(author.value),
        body: posted.value.body,
        createdAt: posted.value.createdAt,
      })
    })
  }

  /** Public (FDBK-9): everyone reads the conversation, oldest first. */
  async read(input: {
    feedbackId: string
    cursor?: string
    limit?: number
  }): Promise<Result<ThreadView, ThreadError>> {
    const feedbackId = EntityId.parse(input.feedbackId)
    if (feedbackId.isErr()) return err(new FeedbackNotFoundError('no such feedback'))

    const feedback = await this.feedbacks.findById(feedbackId.value)
    if (feedback === null) return err(new FeedbackNotFoundError('no such feedback'))

    const after = input.cursor === undefined ? undefined : decodeThreadCursor(input.cursor)
    if (after?.isErr() === true) return err(after.error)

    // one more than asked for, which is how "is there another page" is answered
    // without a second count over the same rows
    const limit = Math.min(Math.max(input.limit ?? THREAD_PAGE_SIZE, 1), MAX_THREAD_PAGE_SIZE)
    const rows = await this.replies.page(feedbackId.value, {
      limit: limit + 1,
      after: after?.isOk() === true ? after.value : undefined,
    })
    const hasMore = rows.length > limit
    const replies = rows.slice(0, limit)
    const last = replies.at(-1)

    // one lookup for the whole page rather than one per reply
    const authors = await this.users.summariesFor(
      replies
        .map((reply) => reply.authorId?.value)
        .filter((value): value is string => value !== undefined),
    )

    return ok({
      items: replies.map((reply) => ({
        id: reply.id.value,
        feedbackId: reply.feedbackId.value,
        author: reply.authorId === null ? null : (authors.get(reply.authorId.value) ?? null),
        body: reply.body,
        createdAt: reply.createdAt,
      })),
      nextCursor:
        hasMore && last !== undefined
          ? encodeThreadCursor({ createdAt: last.createdAt, id: last.id.value })
          : null,
    })
  }
}
