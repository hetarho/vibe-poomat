import { EntityId } from '../../shared/kernel'
import type {
  CreditAccountState,
  CreditLedger,
  LedgerEntry,
  LedgerPage,
} from '../domain/credit-ledger.repository'
import { countersFor, type LedgerMovement } from '../domain/ledger-entry'

const EMPTY = { balance: 0, escrowed: 0, received: 0, given: 0 }

/**
 * The same rules the table enforces, in memory: the unique operation key, the
 * non-negative checks, and figures folded forward beside the log. `lock` is a
 * no-op here — a single-threaded fake has nothing to serialise, and the real
 * lock is what the concurrency integration test exercises.
 */
export class InMemoryCreditLedger implements CreditLedger {
  readonly entries: LedgerEntry[] = []
  private readonly accounts = new Map<string, Omit<CreditAccountState, 'accountId'>>()

  async lock(accountId: string): Promise<CreditAccountState> {
    return this.stateOf(accountId)
  }

  async stateOf(accountId: string): Promise<CreditAccountState> {
    return { accountId, ...(this.accounts.get(accountId) ?? EMPTY) }
  }

  async statesFor(accountIds: readonly string[]): Promise<Map<string, CreditAccountState>> {
    const states = new Map<string, CreditAccountState>()
    for (const accountId of accountIds) states.set(accountId, await this.stateOf(accountId))

    return states
  }

  async record(movement: LedgerMovement): Promise<boolean> {
    const replayed = this.entries.some(
      (entry) =>
        entry.type === movement.type &&
        entry.accountId === movement.accountId &&
        entry.refType === movement.refType &&
        entry.refId === movement.refId,
    )
    if (replayed) return false

    const state = this.accounts.get(movement.accountId) ?? { ...EMPTY }
    const counters = countersFor(movement)
    const next = {
      balance: state.balance + movement.balanceDelta,
      escrowed: state.escrowed + movement.escrowDelta,
      received: state.received + counters.received,
      given: state.given + counters.given,
    }
    // the same thing the check constraints make unwritable
    if (next.balance < 0 || next.escrowed < 0) {
      throw new Error(`movement would take ${movement.accountId} negative`)
    }

    this.accounts.set(movement.accountId, next)
    this.entries.push({
      id: EntityId.generate().value,
      accountId: movement.accountId,
      type: movement.type,
      balanceDelta: movement.balanceDelta,
      escrowDelta: movement.escrowDelta,
      refType: movement.refType,
      refId: movement.refId,
      createdAt: new Date(),
    })

    return true
  }

  async page(accountId: string, options: { limit: number; cursor?: string }): Promise<LedgerPage> {
    const mine = this.entries.filter((entry) => entry.accountId === accountId).reverse()
    const from =
      options.cursor === undefined ? 0 : mine.findIndex((e) => e.id === options.cursor) + 1
    const slice = mine.slice(from, from + options.limit)

    return {
      entries: slice,
      nextCursor: from + options.limit < mine.length ? (slice.at(-1)?.id ?? null) : null,
    }
  }

  async recompute(accountId: string): Promise<Omit<CreditAccountState, 'accountId'>> {
    return this.entries
      .filter((entry) => entry.accountId === accountId)
      .reduce(
        (total, entry) => {
          const counters = countersFor(entry)

          return {
            balance: total.balance + entry.balanceDelta,
            escrowed: total.escrowed + entry.escrowDelta,
            received: total.received + counters.received,
            given: total.given + counters.given,
          }
        },
        { ...EMPTY },
      )
  }
}
