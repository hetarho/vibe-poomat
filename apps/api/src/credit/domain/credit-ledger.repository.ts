import type { LedgerEntryType, LedgerMovement, LedgerRefType } from './ledger-entry'

export const CREDIT_LEDGER = Symbol('CREDIT_LEDGER')

/** The cached figures beside the log (CRED-6): derived, never edited by hand. */
export type CreditAccountState = {
  accountId: string
  balance: number
  escrowed: number
  received: number
  given: number
}

export type LedgerEntry = {
  id: string
  accountId: string
  type: LedgerEntryType
  balanceDelta: number
  escrowDelta: number
  refType: LedgerRefType
  refId: string | null
  createdAt: Date
}

export type LedgerPage = {
  entries: LedgerEntry[]
  /** Null on the last page, never absent, so "no more" is distinguishable (ARCH-17). */
  nextCursor: string | null
}

export type CreditLedger = {
  /**
   * Ensures the account row exists and holds it for the rest of the transaction
   * (`select … for update`). Two people opening a mission against the same
   * balance are serialised here rather than both being told they have enough.
   */
  lock(accountId: string): Promise<CreditAccountState>
  stateOf(accountId: string): Promise<CreditAccountState>
  statesFor(accountIds: readonly string[]): Promise<Map<string, CreditAccountState>>
  /**
   * Appends the entry and folds it into the cached row, in that order and in one
   * statement pair. Returns false when the `(type, account, ref)` key was
   * already there — a replay, which must change nothing.
   */
  record(movement: LedgerMovement): Promise<boolean>
  page(accountId: string, options: { limit: number; cursor?: string }): Promise<LedgerPage>
  /** Recomputes the figures from the log alone. The invariant test's yardstick. */
  recompute(accountId: string): Promise<Omit<CreditAccountState, 'accountId'>>
}
