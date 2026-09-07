import { AsyncLocalStorage } from 'node:async_hooks'
import type { DomainEvent } from '../kernel'
import type { Db } from './db.token'

export type TransactionScope = {
  readonly tx: Db
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

export function hasAmbientTransaction(): boolean {
  return transactionScope.getStore() !== undefined
}
