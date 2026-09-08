import { describe, expect, it } from 'vitest'
import {
  countersFor,
  escrowMovements,
  refundUnfilledMovements,
  SEED_CREDITS,
  seedMovements,
  settleSlotMovements,
  voidMovements,
} from './ledger-entry'

const MAKER = '01920000-0000-7000-8000-00000000000a'
const FEEDBACKER = '01920000-0000-7000-8000-00000000000b'
const MISSION = '01920000-0000-7000-8000-0000000000c1'
const FEEDBACK = '01920000-0000-7000-8000-0000000000f1'

describe('seedMovements (CRED-2)', () => {
  it('adds the two starting credits, keyed by the account itself', () => {
    expect(seedMovements(MAKER)).toEqual([
      {
        accountId: MAKER,
        type: 'seed',
        balanceDelta: SEED_CREDITS,
        escrowDelta: 0,
        refType: 'account',
        refId: MAKER,
      },
    ])
  })

  it('is keyed so a replay can only ever collide with itself', () => {
    const [first] = seedMovements(MAKER)
    const [again] = seedMovements(MAKER)

    expect(first).toEqual(again)
  })
})

describe('escrowMovements (CRED-3)', () => {
  it('moves the credits out of the balance and into the mission escrow', () => {
    expect(escrowMovements(MAKER, MISSION, 3)).toEqual([
      {
        accountId: MAKER,
        type: 'escrow',
        balanceDelta: -3,
        escrowDelta: 3,
        refType: 'mission',
        refId: MISSION,
      },
    ])
  })

  it('nets to zero, because escrow does not create or destroy anything', () => {
    const [movement] = escrowMovements(MAKER, MISSION, 3)

    expect((movement?.balanceDelta ?? 0) + (movement?.escrowDelta ?? 0)).toBe(0)
  })
})

describe('settleSlotMovements (CRED-4)', () => {
  const settle = (to: 'feedbacker' | 'maker') =>
    settleSlotMovements({ feedbackId: FEEDBACK, to, makerId: MAKER, feedbackerId: FEEDBACKER })

  it('pays the feedbacker out of the maker escrow, as two entries', () => {
    expect(settle('feedbacker')).toEqual([
      {
        accountId: MAKER,
        type: 'payout',
        balanceDelta: 0,
        escrowDelta: -1,
        refType: 'feedback',
        refId: FEEDBACK,
      },
      {
        accountId: FEEDBACKER,
        type: 'payout',
        balanceDelta: 1,
        escrowDelta: 0,
        refType: 'feedback',
        refId: FEEDBACK,
      },
    ])
  })

  it('returns the credit to the maker on a rejection, as one', () => {
    expect(settle('maker')).toEqual([
      {
        accountId: MAKER,
        type: 'refund',
        balanceDelta: 1,
        escrowDelta: -1,
        refType: 'feedback',
        refId: FEEDBACK,
      },
    ])
  })

  it('moves exactly one credit either way, and never more', () => {
    for (const to of ['feedbacker', 'maker'] as const) {
      const escrowReleased = settle(to).reduce(
        (total, movement) => total + Math.max(0, -movement.escrowDelta),
        0,
      )
      expect(escrowReleased).toBe(1)
    }
  })
})

describe('refundUnfilledMovements (CRED-5)', () => {
  it('returns escrow for slots nobody took', () => {
    expect(refundUnfilledMovements(MAKER, MISSION, 2)).toEqual([
      {
        accountId: MAKER,
        type: 'refund',
        balanceDelta: 2,
        escrowDelta: -2,
        refType: 'mission',
        refId: MISSION,
      },
    ])
  })

  it('is keyed apart from the escrow it reverses, so both can exist', () => {
    const [escrowed] = escrowMovements(MAKER, MISSION, 2)
    const [refunded] = refundUnfilledMovements(MAKER, MISSION, 2)

    expect(escrowed?.type).not.toBe(refunded?.type)
    expect(escrowed?.refId).toBe(refunded?.refId)
  })
})

describe('voidMovements (CRED-8)', () => {
  it('zeroes exactly what the account holds', () => {
    expect(voidMovements(MAKER, 4, 2)).toEqual([
      {
        accountId: MAKER,
        type: 'void',
        balanceDelta: -4,
        escrowDelta: -2,
        refType: 'account',
        refId: MAKER,
      },
    ])
  })

  it('writes nothing when there is nothing left to void', () => {
    expect(voidMovements(MAKER, 0, 0)).toEqual([])
  })
})

describe('countersFor (CRED-7)', () => {
  it('counts a payout as given by the maker and received by the feedbacker', () => {
    const [maker, feedbacker] = settleSlotMovements({
      feedbackId: FEEDBACK,
      to: 'feedbacker',
      makerId: MAKER,
      feedbackerId: FEEDBACKER,
    })

    if (maker === undefined || feedbacker === undefined) throw new Error('expected two entries')
    expect(countersFor(maker)).toEqual({ received: 0, given: 1 })
    expect(countersFor(feedbacker)).toEqual({ received: 1, given: 0 })
  })

  it.each(['seed', 'escrow', 'refund', 'void'] as const)('counts nothing for %s', (type) => {
    expect(countersFor({ type, balanceDelta: 1, escrowDelta: -1 })).toEqual({
      received: 0,
      given: 0,
    })
  })
})
