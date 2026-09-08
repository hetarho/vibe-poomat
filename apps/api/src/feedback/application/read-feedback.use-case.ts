import type { UserSummary, UserSummaryReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { FeedbackNotFoundError } from '../domain/claim-errors'
import type { Feedback } from '../domain/feedback'
import type { FeedbackRepository } from '../domain/feedback.repository'
import { type FeedbackView, toFeedbackView } from './feedback-view'

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

  private async authorOf(feedback: Feedback): Promise<UserSummary | null> {
    if (feedback.authorId === null) return null

    return this.users.summaryFor(feedback.authorId.value)
  }
}
