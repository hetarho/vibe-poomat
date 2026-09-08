import type { EntityId } from '../../shared/kernel'
import type { FeedbackReply } from './feedback-reply'

export const REPLY_REPOSITORY = Symbol('REPLY_REPOSITORY')

/**
 * The keys the thread is ordered by, which is what a cursor carries (ARCH-17).
 * `created_at` leads because that is the indexed column; the id follows as the
 * tiebreaker of last resort, so two replies in the same millisecond still have
 * one total order.
 */
export type ThreadCursorKeys = {
  createdAt: Date
  id: string
}

export type ReplyRepository = {
  /** Oldest first: a conversation reads forwards. */
  page(
    feedbackId: EntityId,
    options: { limit: number; after?: ThreadCursorKeys },
  ): Promise<FeedbackReply[]>
  save(reply: FeedbackReply): Promise<void>
}
