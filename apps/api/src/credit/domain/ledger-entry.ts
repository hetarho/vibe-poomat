/**
 * The five ways credits move (CRED-6). Every entry is one of these and nothing
 * else edits a balance — there is no adjustment type on purpose (CRED-10).
 */
export const LEDGER_ENTRY_TYPES = ['seed', 'escrow', 'payout', 'refund', 'void'] as const

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number]

/** What a movement is *about*, which together with the type makes it replayable. */
export const LEDGER_REF_TYPES = ['account', 'mission', 'feedback'] as const

export type LedgerRefType = (typeof LEDGER_REF_TYPES)[number]

/** CRED-2: the grant that lets a first mission open two slots. */
export const SEED_CREDITS = 2

/**
 * One row of the append-only log. `(type, accountId, refType, refId)` is unique,
 * which is what makes every operation below idempotent: replaying it writes
 * nothing rather than paying someone twice.
 */
export type LedgerMovement = {
  accountId: string
  type: LedgerEntryType
  /** Whole credits, positive or negative; never fractional (CRED-1). */
  balanceDelta: number
  escrowDelta: number
  refType: LedgerRefType
  refId: string
}

/**
 * The public reciprocity counters (CRED-7). Derived from payouts alone, and
 * derived here rather than stored on the entry, so the cached row can always be
 * recomputed from the log — which is what the invariant test checks.
 */
export type CreditCounters = { received: number; given: number }

/** Takes only what it reads, so a stored entry answers as readily as a movement. */
export function countersFor(
  movement: Pick<LedgerMovement, 'type' | 'balanceDelta' | 'escrowDelta'>,
): CreditCounters {
  if (movement.type !== 'payout') return { received: 0, given: 0 }

  return {
    // the feedbacker was paid
    received: movement.balanceDelta > 0 ? movement.balanceDelta : 0,
    // the maker's escrow left for someone else
    given: movement.escrowDelta < 0 ? -movement.escrowDelta : 0,
  }
}

/** CRED-2, once per account: the ref is the account itself. */
export function seedMovements(accountId: string): LedgerMovement[] {
  return [
    {
      accountId,
      type: 'seed',
      balanceDelta: SEED_CREDITS,
      escrowDelta: 0,
      refType: 'account',
      refId: accountId,
    },
  ]
}

/** CRED-3: opening a mission moves N out of the balance and into its escrow. */
export function escrowMovements(
  accountId: string,
  missionId: string,
  credits: number,
): LedgerMovement[] {
  return [
    {
      accountId,
      type: 'escrow',
      balanceDelta: -credits,
      escrowDelta: credits,
      refType: 'mission',
      refId: missionId,
    },
  ]
}

/**
 * CRED-4, one slot at a time. Accepted work pays the feedbacker out of the
 * maker's escrow, which is two entries because two accounts move; a rejection
 * returns the credit to the maker, which is one, because only theirs does.
 */
export function settleSlotMovements(input: {
  feedbackId: string
  to: 'feedbacker' | 'maker'
  makerId: string
  feedbackerId: string
}): LedgerMovement[] {
  if (input.to === 'maker') {
    return [
      {
        accountId: input.makerId,
        type: 'refund',
        balanceDelta: 1,
        escrowDelta: -1,
        refType: 'feedback',
        refId: input.feedbackId,
      },
    ]
  }

  return [
    {
      accountId: input.makerId,
      type: 'payout',
      balanceDelta: 0,
      escrowDelta: -1,
      refType: 'feedback',
      refId: input.feedbackId,
    },
    {
      accountId: input.feedbackerId,
      type: 'payout',
      balanceDelta: 1,
      escrowDelta: 0,
      refType: 'feedback',
      refId: input.feedbackId,
    },
  ]
}

/** CRED-5: escrow for slots nobody took goes back to the maker. */
export function refundUnfilledMovements(
  makerId: string,
  missionId: string,
  credits: number,
): LedgerMovement[] {
  return [
    {
      accountId: makerId,
      type: 'refund',
      balanceDelta: credits,
      escrowDelta: -credits,
      refType: 'mission',
      refId: missionId,
    },
  ]
}

/**
 * CRED-8: on deletion whatever is left simply stops existing. Credits are never
 * destroyed except here, which is why the movement takes the current figures —
 * it has to zero exactly what the account holds, not a number someone guessed.
 */
export function voidMovements(
  accountId: string,
  balance: number,
  escrowed: number,
): LedgerMovement[] {
  if (balance === 0 && escrowed === 0) return []

  return [
    {
      accountId,
      type: 'void',
      balanceDelta: -balance,
      escrowDelta: -escrowed,
      refType: 'account',
      refId: accountId,
    },
  ]
}
