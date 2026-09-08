import { Injectable } from '@nestjs/common'
import { inArray, sql } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import type {
  CreditAccountState,
  CreditLedger,
  LedgerEntry,
  LedgerPage,
} from '../../domain/credit-ledger.repository'
import type { LedgerEntryType, LedgerRefType } from '../../domain/ledger-entry'
import { countersFor, type LedgerMovement } from '../../domain/ledger-entry'
import { creditAccounts } from './schema'

type AccountRow = {
  account_id: string
  balance: number
  escrowed: number
  received: number
  given: number
}

type EntryRow = {
  id: string
  account_id: string
  type: string
  balance_delta: number
  escrow_delta: number
  ref_type: string
  ref_id: string | null
  // raw `execute` hands back what the driver parsed, and a timestamptz arrives as
  // a string: the column type mappers only apply to the query builder
  created_at: string | Date
}

function toState(row: AccountRow): CreditAccountState {
  return {
    accountId: row.account_id,
    balance: Number(row.balance),
    escrowed: Number(row.escrowed),
    received: Number(row.received),
    given: Number(row.given),
  }
}

function toEntry(row: EntryRow): LedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type as LedgerEntryType,
    balanceDelta: Number(row.balance_delta),
    escrowDelta: Number(row.escrow_delta),
    refType: row.ref_type as LedgerRefType,
    refId: row.ref_id,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  }
}

const EMPTY: Omit<CreditAccountState, 'accountId'> = {
  balance: 0,
  escrowed: 0,
  received: 0,
  given: 0,
}

@Injectable()
export class DrizzleCreditLedgerRepository implements CreditLedger {
  /**
   * Creates the row if this account has never moved a credit, then holds it for
   * the rest of the transaction. The lock is the whole concurrency story: two
   * missions opening against one balance are serialised here, so the second sees
   * what the first spent rather than the balance they both started from.
   */
  async lock(accountId: string): Promise<CreditAccountState> {
    await this.ensure(accountId)

    const { rows } = await getDb().execute<AccountRow>(sql`
      select account_id, balance, escrowed, received, given
      from credit_accounts
      where account_id = ${accountId}
      for update
    `)
    const row = rows[0]
    if (row === undefined) throw new Error(`credit account ${accountId} vanished mid-transaction`)

    return toState(row)
  }

  async stateOf(accountId: string): Promise<CreditAccountState> {
    const { rows } = await getDb().execute<AccountRow>(sql`
      select account_id, balance, escrowed, received, given
      from credit_accounts
      where account_id = ${accountId}
    `)
    const row = rows[0]

    // an account nobody has moved a credit for simply has none
    return row === undefined ? { accountId, ...EMPTY } : toState(row)
  }

  async statesFor(accountIds: readonly string[]): Promise<Map<string, CreditAccountState>> {
    const states = new Map<string, CreditAccountState>()
    for (const accountId of accountIds) states.set(accountId, { accountId, ...EMPTY })
    if (accountIds.length === 0) return states

    // through the query builder rather than raw sql, so the ids are bound
    const rows = await getDb()
      .select()
      .from(creditAccounts)
      .where(inArray(creditAccounts.accountId, [...accountIds]))
    for (const row of rows) {
      states.set(row.accountId, {
        accountId: row.accountId,
        balance: row.balance,
        escrowed: row.escrowed,
        received: row.received,
        given: row.given,
      })
    }

    return states
  }

  /**
   * Appends the entry and folds it into the cached row in one statement, so the
   * two can never disagree: the update only fires when the insert was new, and
   * an insert that hit the unique key leaves both untouched.
   *
   * Callers lock the account first (see `lock`); this is where the write lands,
   * not where the race is decided.
   */
  async record(movement: LedgerMovement): Promise<boolean> {
    await this.ensure(movement.accountId)

    const counters = countersFor(movement)
    const { rows } = await getDb().execute<{ account_id: string }>(sql`
      with inserted as (
        insert into ledger_entries
          (id, account_id, type, balance_delta, escrow_delta, ref_type, ref_id)
        values (
          ${EntityId.generate().value},
          ${movement.accountId},
          ${movement.type},
          ${movement.balanceDelta},
          ${movement.escrowDelta},
          ${movement.refType},
          ${movement.refId}
        )
        on conflict do nothing
        returning 1
      )
      update credit_accounts set
        balance = balance + ${movement.balanceDelta},
        escrowed = escrowed + ${movement.escrowDelta},
        received = received + ${counters.received},
        given = given + ${counters.given},
        updated_at = now()
      where account_id = ${movement.accountId} and exists (select 1 from inserted)
      returning account_id
    `)

    return rows.length > 0
  }

  async page(accountId: string, options: { limit: number; cursor?: string }): Promise<LedgerPage> {
    const cursor = options.cursor ?? null
    const { rows } = await getDb().execute<EntryRow>(sql`
      select id, account_id, type, balance_delta, escrow_delta, ref_type, ref_id, created_at
      from ledger_entries
      where account_id = ${accountId}
        and (${cursor}::uuid is null or id < ${cursor}::uuid)
      order by id desc
      limit ${options.limit + 1}
    `)

    // one more than asked for is how "there is another page" is known without a
    // second count query
    const hasMore = rows.length > options.limit
    const entries = rows.slice(0, options.limit).map(toEntry)

    return {
      entries,
      nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    }
  }

  /**
   * The figures as the log alone says they are. Nothing in production reads this
   * — it exists so a test can prove the cached row never drifts from the entries
   * that produced it (CRED-6).
   */
  async recompute(accountId: string): Promise<Omit<CreditAccountState, 'accountId'>> {
    const { rows } = await getDb().execute<{
      balance: string
      escrowed: string
      received: string
      given: string
    }>(sql`
      select
        coalesce(sum(balance_delta), 0)::text as balance,
        coalesce(sum(escrow_delta), 0)::text as escrowed,
        coalesce(sum(case when type = 'payout' and balance_delta > 0 then balance_delta else 0 end), 0)::text as received,
        coalesce(sum(case when type = 'payout' and escrow_delta < 0 then -escrow_delta else 0 end), 0)::text as given
      from ledger_entries
      where account_id = ${accountId}
    `)
    const row = rows[0]
    if (row === undefined) return EMPTY

    return {
      balance: Number(row.balance),
      escrowed: Number(row.escrowed),
      received: Number(row.received),
      given: Number(row.given),
    }
  }

  private async ensure(accountId: string): Promise<void> {
    await getDb().execute(sql`
      insert into credit_accounts (account_id) values (${accountId})
      on conflict (account_id) do nothing
    `)
  }
}
