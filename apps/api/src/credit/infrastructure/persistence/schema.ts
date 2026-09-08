import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { entityId } from '../../../shared/db'

/**
 * The append-only log (CRED-6). Nothing ever updates a row here, which is why it
 * carries `created_at` and no `updated_at`: an entry that could be edited would
 * not be a ledger.
 *
 * The unique key is what makes every operation idempotent — a redelivered job or
 * a retried request writes nothing rather than paying someone a second time.
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: entityId(),
    accountId: uuid('account_id').notNull(),
    type: text('type').notNull(),
    balanceDelta: integer('balance_delta').notNull(),
    escrowDelta: integer('escrow_delta').notNull(),
    refType: text('ref_type').notNull(),
    refId: uuid('ref_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // the owner's own page, newest first
    index('ledger_entries_account_idx').on(table.accountId, table.createdAt),
    // partial, because an entry with no reference is not an operation anyone
    // could replay — there is nothing to match it against
    uniqueIndex('ledger_entries_operation_unq')
      .on(table.type, table.accountId, table.refType, table.refId)
      .where(sql`${table.refId} is not null`),
  ],
)

/**
 * The figures derived from the log, cached beside it. CRED-6 wants balances
 * derived, and they are — but a `sum()` over the log per feed render is not
 * something to build on, so this row is folded forward in the same transaction
 * as the entry that moved it, and the integration test recomputes it from the
 * log to prove the two never drift.
 *
 * The check constraints make the impossible state unwritable: a negative balance
 * or escrow cannot exist even if a caller's arithmetic is wrong (CRED-1).
 */
export const creditAccounts = pgTable(
  'credit_accounts',
  {
    accountId: uuid('account_id').primaryKey(),
    balance: integer('balance').notNull().default(0),
    escrowed: integer('escrowed').notNull().default(0),
    received: integer('received').notNull().default(0),
    given: integer('given').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('credit_accounts_balance_non_negative', sql`${table.balance} >= 0`),
    check('credit_accounts_escrowed_non_negative', sql`${table.escrowed} >= 0`),
  ],
)
