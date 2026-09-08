import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { entityId, timestamps } from '../../../shared/db'

/**
 * One row per hold (FDBK-1). `mission_id` and `user_id` carry no foreign keys:
 * missions and accounts belong to other contexts, and ARCH-14 references them by
 * id alone.
 *
 * The partial unique index is FDBK-2 itself: at most one live claim per account
 * per mission, while a released one leaves the way clear to try again — there is
 * no re-claim limit in v1.
 */
export const feedbackClaims = pgTable(
  'feedback_claims',
  {
    id: entityId(),
    missionId: uuid('mission_id').notNull(),
    userId: uuid('user_id').notNull(),
    state: text('state').notNull(),
    /** Absolute, so a restart cannot shift the release (ARCH-35). */
    heldUntil: timestamp('held_until', { withTimezone: true }).notNull(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('feedback_claims_mission_idx').on(table.missionId),
    uniqueIndex('feedback_claims_one_live_per_user_unq')
      .on(table.missionId, table.userId)
      .where(sql`${table.state} in ('held', 'submitted', 'settled')`),
  ],
)

/**
 * A submitted report (FDBK-3). One per claim, which the unique column is what
 * guarantees — a retried submit finds the row already there rather than writing
 * a second one.
 *
 * `author_id` is nullable precisely so AUTH-9 can anonymise a deleted account
 * without deleting the report: FDBK-9 keeps it public, shown as a deleted user.
 *
 * `project_id` is denormalised so the maker's own list and the profile stats
 * (T029) never need a mission join to answer.
 */
export const feedbacks = pgTable(
  'feedbacks',
  {
    id: entityId(),
    claimId: uuid('claim_id').notNull().unique(),
    missionId: uuid('mission_id').notNull(),
    projectId: uuid('project_id').notNull(),
    authorId: uuid('author_id'),
    firstImpression: text('first_impression').notNull(),
    stuckAt: text('stuck_at').notNull(),
    wouldPay: boolean('would_pay').notNull(),
    wouldPayReason: text('would_pay_reason').notNull(),
    suggestion: text('suggestion').notNull(),
    /** Positional against the mission's frozen questions (PROJ-7). */
    answers: jsonb('answers').$type<string[]>().notNull(),
    state: text('state').notNull(),
    rejectionReason: text('rejection_reason'),
    rejectionNote: text('rejection_note'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    /** FDBK-7: true when the 72-hour clock decided rather than the maker. */
    automatic: boolean('automatic').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    index('feedbacks_mission_idx').on(table.missionId),
    index('feedbacks_author_idx').on(table.authorId),
    index('feedbacks_project_idx').on(table.projectId),
  ],
)

/**
 * FDBK-5's flat two-party thread. There is no participants table, because the
 * pair is fixed for the life of the thread: the report's author and the project
 * owner, resolved per request from rows that already exist.
 *
 * `author_id` is nullable for the same reason the report's is — AUTH-9
 * anonymises rather than deletes — and there is no `updated_at`, because a reply
 * is never edited in v1.
 */
export const feedbackReplies = pgTable(
  'feedback_replies',
  {
    id: entityId(),
    feedbackId: uuid('feedback_id').notNull(),
    authorId: uuid('author_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('feedback_replies_thread_idx').on(table.feedbackId, table.createdAt)],
)
