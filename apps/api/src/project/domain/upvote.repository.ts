import type { EntityId } from '../../shared/kernel'

export const UPVOTE_REPOSITORY = Symbol('UPVOTE_REPOSITORY')

export type UpvoteOutcome = {
  /** Where the toggle left it: true means the caller's vote now stands. */
  upvoted: boolean
  /** The project's total afterwards, read back rather than guessed. */
  upvoteCount: number
}

/**
 * PROJ-11: one per account per project, toggleable, never on your own. The
 * composite primary key is what makes "one" true under concurrency; the count on
 * the project row moves in the same transaction as the vote, so the number a
 * feed sorts by is never a stale echo of the rows.
 */
export type UpvoteRepository = {
  toggle(projectId: EntityId, userId: EntityId): Promise<UpvoteOutcome>
  /** Which of these the caller has upvoted, in one query for a whole page. */
  upvotedBy(userId: EntityId, projectIds: readonly string[]): Promise<Set<string>>
  countFor(projectId: EntityId): Promise<number>
}
