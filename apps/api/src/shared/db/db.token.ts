import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

/** The Drizzle client. Repositories inject this, never a module-level singleton. */
export const DB = Symbol('DB')

/** The underlying pg pool, needed for shutdown and for the readiness probe. */
export const PG_POOL = Symbol('PG_POOL')

export type Db = NodePgDatabase<Record<string, never>>
