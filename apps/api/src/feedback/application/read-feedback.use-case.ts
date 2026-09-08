import type { UserSummary, UserSummaryReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { FeedbackNotFoundError } from '../domain/claim-errors'
import type { Feedback } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { type FeedbackView, toFeedbackView } from './feedback-view'
import {
  decodeReceivedCursor,
  encodeReceivedCursor,
  type ReceivedCursorNotAllowedError,
} from './received-cursor'

export const GIVEN_PAGE_SIZE = 10
const MAX_GIVEN_PAGE_SIZE = 50

export type FeedbackPage = {
  items: FeedbackView[]
  nextCursor: string | null
}

/** Opaque, so nothing outside comes to depend on the ordering being by id. */
function encodeGivenCursor(feedback: Feedback): string {
  return Buffer.from(feedback.id.value, 'utf8').toString('base64url')
}

function decodeGivenCursor(
  cursor: string | undefined,
): Result<string | null, FeedbackNotFoundError> {
  if (cursor === undefined) return ok(null)

  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  // checked because it reaches a query, and a cursor is caller-supplied
  if (!EntityId.isValid(decoded)) return err(new FeedbackNotFoundError('this page does not exist'))

  return ok(decoded)
}

/**
 * FDBK-9: a submitted report is public, rejection reason and all. Nothing here
 * hides a rejected one — the reason is exactly what makes a rejection reviewable
 * by the person who received it.
 */
export class ReadFeedbackUseCase {
  constructor(
    private readonly feedbacks: FeedbackRepository,
    private readonly users: UserSummaryReader,
  ) {}

  async byId(feedbackId: string): Promise<Result<FeedbackView, FeedbackNotFoundError>> {
    const id = EntityId.parse(feedbackId)
    if (id.isErr()) return err(new FeedbackNotFoundError('no such feedback'))

    const feedback = await this.feedbacks.findById(id.value)
    if (feedback === null) return err(new FeedbackNotFoundError('no such feedback'))

    return ok(toFeedbackView(feedback, await this.authorOf(feedback)))
  }

  async forMission(missionId: string): Promise<FeedbackView[]> {
    const id = EntityId.parse(missionId)
    if (id.isErr()) return []

    const found = await this.feedbacks.listForMission(id.value)
    // one lookup for the whole list rather than one per report
    const authors = await this.users.summariesFor(
      found
        .map((feedback) => feedback.authorId?.value)
        .filter((value): value is string => value !== undefined),
    )

    return found.map((feedback) =>
      toFeedbackView(
        feedback,
        feedback.authorId === null ? null : (authors.get(feedback.authorId.value) ?? null),
      ),
    )
  }

  /**
   * AUTH-3: what this account has given, newest first. Public, like every
   * submitted report (FDBK-9), and paged with an opaque cursor rather than an
   * offset so a report written mid-read cannot shift the page (ARCH-17).
   */
  async forAuthor(input: {
    authorId: string
    limit?: number
    cursor?: string
  }): Promise<Result<FeedbackPage, FeedbackNotFoundError>> {
    const id = EntityId.parse(input.authorId)
    if (id.isErr()) return ok({ items: [], nextCursor: null })

    const limit = Math.min(Math.max(input.limit ?? GIVEN_PAGE_SIZE, 1), MAX_GIVEN_PAGE_SIZE)
    const before = decodeGivenCursor(input.cursor)
    if (before.isErr()) return err(new FeedbackNotFoundError('this page does not exist'))

    const rows = await this.feedbacks.listForAuthor(id.value, {
      limit: limit + 1,
      ...(before.value === null ? {} : { before: before.value }),
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)
    const author = await this.users.summaryFor(id.value.value)

    return ok({
      items: page.map((feedback) => toFeedbackView(feedback, author)),
      nextCursor: hasMore ? encodeGivenCursor(page.at(-1) as Feedback) : null,
    })
  }

  /**
   * FDBK-9: every report a project has received, newest first, public like the
   * rest. Keyed on the project rather than the mission because a project's
   * feedback outlives the mission it was written for, and the project view only
   * ever carries the mission that is still open (PROJ-5).
   */
  async forProject(input: {
    projectId: string
    limit?: number
    cursor?: string
  }): Promise<Result<FeedbackPage, FeedbackNotFoundError>> {
    const id = EntityId.parse(input.projectId)
    if (id.isErr()) return ok({ items: [], nextCursor: null })

    const limit = Math.min(Math.max(input.limit ?? GIVEN_PAGE_SIZE, 1), MAX_GIVEN_PAGE_SIZE)
    const before = decodeGivenCursor(input.cursor)
    if (before.isErr()) return err(new FeedbackNotFoundError('this page does not exist'))

    const rows = await this.feedbacks.listForProject(id.value, {
      limit: limit + 1,
      ...(before.value === null ? {} : { before: before.value }),
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    // every report on a project has a different author, so one batched lookup
    // rather than one per row
    const authors = await this.users.summariesFor(
      page
        .map((feedback) => feedback.authorId?.value)
        .filter((value): value is string => value !== undefined),
    )

    return ok({
      items: page.map((feedback) =>
        toFeedbackView(
          feedback,
          feedback.authorId === null ? null : (authors.get(feedback.authorId.value) ?? null),
        ),
      ),
      nextCursor: hasMore ? encodeGivenCursor(page.at(-1) as Feedback) : null,
    })
  }

  /**
   * The maker's inbox: every report written for their projects, the ones still
   * waiting on a decision first (FDBK-7 puts a clock on those), then newest
   * first. Answered from the denormalised `maker_id`, so no cross-context join
   * is needed — PROJ-12 gives a project one owner for life, so it cannot go stale.
   */
  async received(input: {
    makerId: string
    limit?: number
    cursor?: string
  }): Promise<Result<FeedbackPage, FeedbackNotFoundError | ReceivedCursorNotAllowedError>> {
    const id = EntityId.parse(input.makerId)
    if (id.isErr()) return ok({ items: [], nextCursor: null })

    const limit = Math.min(Math.max(input.limit ?? GIVEN_PAGE_SIZE, 1), MAX_GIVEN_PAGE_SIZE)
    const after = input.cursor === undefined ? null : decodeReceivedCursor(input.cursor)
    if (after?.isErr() === true) return err(after.error)

    const rows = await this.feedbacks.listReceivedBy(id.value, {
      limit: limit + 1,
      ...(after?.isOk() === true ? { after: after.value } : {}),
    })
    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    const authors = await this.users.summariesFor(
      page
        .map((feedback) => feedback.authorId?.value)
        .filter((value): value is string => value !== undefined),
    )

    const last = page.at(-1)

    return ok({
      items: page.map((feedback) =>
        toFeedbackView(
          feedback,
          feedback.authorId === null ? null : (authors.get(feedback.authorId.value) ?? null),
        ),
      ),
      nextCursor:
        hasMore && last !== undefined
          ? encodeReceivedCursor({ pending: last.state === 'pending', id: last.id.value })
          : null,
    })
  }

  private async authorOf(feedback: Feedback): Promise<UserSummary | null> {
    if (feedback.authorId === null) return null

    return this.users.summaryFor(feedback.authorId.value)
  }
}
