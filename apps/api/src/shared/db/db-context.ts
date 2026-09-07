import type { Db } from './db.token'
import { currentTransaction } from './transaction-scope'

/**
 * DbModule hands the pooled client over at init. A module-level holder is what
 * lets `getDb()` be a plain function, which is the point: a repository asks for
 * the database and gets the ambient transaction if there is one, with nothing
 * about transactions in its own signature.
 */
let pooledDb: Db | undefined

export function setPooledDb(db: Db | undefined): void {
  pooledDb = db
}

export function getDb(): Db {
  const ambient = currentTransaction()
  if (ambient !== undefined) return ambient
  if (pooledDb === undefined) {
    throw new Error('the database client is not available: DbModule has not initialised yet')
  }

  return pooledDb
}
