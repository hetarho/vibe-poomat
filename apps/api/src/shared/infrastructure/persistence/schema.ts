import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * Rate-limit counters (ARCH-41). PostgreSQL rather than Redis, because ARCH-33
 * keeps the infrastructure to one database; a row per key and window.
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    hits: integer('hits').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  },
  (table) => [index('rate_limits_expires_at_idx').on(table.expiresAt)],
)
