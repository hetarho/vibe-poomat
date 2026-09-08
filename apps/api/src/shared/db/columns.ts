import { customType, timestamp, uuid } from 'drizzle-orm/pg-core'

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

/**
 * Case-insensitive text, for columns whose equality must not depend on case —
 * the account handle above all (AUTH: unique and case-insensitive). A column
 * type rather than a `lower()` functional index, because the type holds for
 * every query ever written, while the index only helps the ones that remembered
 * to call `lower()`. The migration enables the extension.
 */
export const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
})
