/** PostgreSQL's SQLSTATE for a unique or exclusion constraint violation. */
const UNIQUE_VIOLATION = '23505'

/** Deep enough for a driver wrapper, shallow enough that a cycle cannot trap us. */
const MAX_CAUSE_DEPTH = 5

/**
 * Lets a repository turn a race it could not have prevented into a domain error
 * (ARCH-12) instead of letting a driver error escape. Checking the constraint
 * name matters: a table usually has more than one unique index, and only the one
 * the caller asked about maps onto the error it wants to return.
 *
 * The chain is walked because Drizzle reports a failed statement as its own
 * error and keeps the pg one — the only thing carrying the SQLSTATE — as `cause`.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let candidate: unknown = error

  for (let depth = 0; depth <= MAX_CAUSE_DEPTH; depth++) {
    if (typeof candidate !== 'object' || candidate === null) return false

    const pgError = candidate as { code?: unknown; constraint?: unknown; cause?: unknown }
    if (pgError.code === UNIQUE_VIOLATION && pgError.constraint === constraint) return true

    candidate = pgError.cause
  }

  return false
}
