import { z } from 'zod'
import { cursorPageSchema, entityId, isoDate } from './common'

/** The five ways credits move (CRED-6). No adjustment type exists (CRED-10). */
export const ledgerEntryTypeSchema = z.enum(['seed', 'escrow', 'payout', 'refund', 'void'])

export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>

export const ledgerRefTypeSchema = z.enum(['account', 'mission', 'feedback'])

export type LedgerRefType = z.infer<typeof ledgerRefTypeSchema>

export const ledgerEntrySchema = z.object({
  id: entityId,
  type: ledgerEntryTypeSchema,
  balanceDelta: z.int(),
  escrowDelta: z.int(),
  refType: ledgerRefTypeSchema,
  refId: entityId.nullable(),
  createdAt: isoDate,
})

export type LedgerEntry = z.infer<typeof ledgerEntrySchema>

/**
 * The owner's own view (CRED-7): the public counters, plus `escrowed` and the
 * entries themselves, which nobody else may see.
 */
export const myCreditsSchema = z.object({
  balance: z.int().nonnegative(),
  escrowed: z.int().nonnegative(),
  received: z.int().nonnegative(),
  given: z.int().nonnegative(),
  ledger: cursorPageSchema(ledgerEntrySchema),
})

export type MyCredits = z.infer<typeof myCreditsSchema>
