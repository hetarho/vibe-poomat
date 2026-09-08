import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { citext, entityId, timestamps } from '../../../shared/db'
import { BIO_MAX_LENGTH } from '../../domain/bio'

/**
 * The account and its public profile (AUTH-3). `handle` is citext, so the unique
 * constraint is case-insensitive by the column's own definition rather than by
 * every caller remembering to lowercase (AUTH constraint).
 */
export const users = pgTable('users', {
  id: entityId(),
  handle: citext('handle').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: varchar('bio', { length: BIO_MAX_LENGTH }),
  link: text('link'),
  ...timestamps(),
})

/**
 * A provider account attached to one of ours. `user_id` carries no foreign key:
 * ARCH-14 forbids them across contexts, and this one is inside `auth`, but the
 * same rule is applied here so every reference in the codebase reads alike.
 */
export const identities = pgTable(
  'identities',
  {
    id: entityId(),
    userId: uuid('user_id').notNull(),
    provider: text('provider').notNull(),
    providerUserId: text('provider_user_id').notNull(),
    email: text('email').notNull(),
    emailVerified: boolean('email_verified').notNull(),
    ...timestamps(),
  },
  (table) => [
    // one provider account belongs to exactly one of ours; this is what makes a
    // second sign-in a lookup rather than a second account
    unique('identities_provider_account_unq').on(table.provider, table.providerUserId),
    // AUTH-5 only ever asks this of verified rows, so the index only holds those
    index('identities_verified_email_idx').on(table.email).where(sql`${table.emailVerified}`),
  ],
)

/**
 * Sessions live in PostgreSQL behind the SessionStore port (ARCH-19). The
 * primary key is the cookie value itself: high-entropy, single-purpose and
 * replaced at every sign-in.
 *
 * `last_seen_at` stands in for the `updated_at` ARCH-14 asks of other tables —
 * it is the same fact under the name the sliding-expiry rule (AUTH-8) reads it by.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // signing every device out of one account, which AUTH-9 needs at deletion
    index('sessions_user_id_idx').on(table.userId),
    // the sweep that reaps lapsed rows
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)
