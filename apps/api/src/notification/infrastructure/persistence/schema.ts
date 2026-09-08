import { boolean, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * NOTI-3's opt-outs. There is a row only once somebody has changed something: a
 * missing row means enabled, which is what keeps a new event type from needing a
 * backfill across every account.
 *
 * `user_id` carries no foreign key — accounts belong to the `auth` context and
 * ARCH-14 references them by id alone.
 */
export const notificationPrefs = pgTable(
  'notification_prefs',
  {
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type] })],
)
