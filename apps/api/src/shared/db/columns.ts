import { timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Primary key of every table: a UUIDv7 the application generates, with no
 * database default, so the id exists before the row does (ARCH-14).
 */
export function entityId() {
  return uuid('id').primaryKey()
}

/**
 * `created_at` / `updated_at` on every table (ARCH-14). `deleted_at` is
 * deliberately absent: soft delete is opt-in per SSOT, not a global default.
 */
export function timestamps() {
  return {
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }
}
