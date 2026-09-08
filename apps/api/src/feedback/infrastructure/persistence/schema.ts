import { sql } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
