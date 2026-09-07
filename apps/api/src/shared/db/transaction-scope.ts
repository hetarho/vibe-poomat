import { AsyncLocalStorage } from 'node:async_hooks'
import type { PoolClient } from 'pg'
import type { DomainEvent } from '../kernel'
import type { Db } from './db.token'

export type TransactionScope = {
  /** The Drizzle client bound to the open transaction. */
  readonly tx: Db
  /** The same connection as raw pg, which is what pg-boss needs to join in. */
  readonly client: PoolClient
  readonly events: DomainEvent[]
}

/**
 * Carries the open transaction and the events collected inside it. Ambient
 * rather than a parameter, so a use case's ports never mention a Drizzle type
 * (ARCH-11) and every repository in the call joins the same transaction.
 */
export const transactionScope = new AsyncLocalStorage<TransactionScope>()

export function currentTransaction(): Db | undefined {
  return transactionScope.getStore()?.tx
}

export function currentTransactionClient(): PoolClient | undefined {
  return transactionScope.getStore()?.client
}

export function hasAmbientTransaction(): boolean {
  return transactionScope.getStore() !== undefined
}
