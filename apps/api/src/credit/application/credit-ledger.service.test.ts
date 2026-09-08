import { beforeEach, describe, expect, it } from 'vitest'
import { SEED_CREDITS } from '../domain/ledger-entry'
import { InMemoryCreditLedger } from '../test-support/in-memory-credit-ledger'
import { CreditLedgerService } from './credit-ledger.service'

const MAKER = '01920000-0000-7000-8000-00000000000a'
const FEEDBACKER = '01920000-0000-7000-8000-00000000000b'
const MISSION = '01920000-0000-7000-8000-0000000000c1'
const OTHER_MISSION = '01920000-0000-7000-8000-0000000000c2'
const FEEDBACK = '01920000-0000-7000-8000-0000000000f1'

const passthroughTransactions = { run: async <T>(work: () => Promise<T>): Promise<T> => work() }

describe('CreditLedgerService', () => {
  let ledger: InMemoryCreditLedger
  let credits: CreditLedgerService

  beforeEach(() => {
    ledger = new InMemoryCreditLedger()
    credits = new CreditLedgerService(ledger, passthroughTransactions)
  })

  async function seededMaker(): Promise<void> {
    await credits.grantSeed(MAKER)
  }

  describe('grantSeed (CRED-2)', () => {
    it('grants the two starting credits', async () => {
      expect((await credits.grantSeed(MAKER)).isOk()).toBe(true)

      expect((await credits.stateOf(MAKER)).balance).toBe(SEED_CREDITS)
    })

    it('is a no-op on replay, so a redelivered event pays nothing twice', async () => {
      await credits.grantSeed(MAKER)

      expect((await credits.grantSeed(MAKER)).isOk()).toBe(true)

      expect((await credits.stateOf(MAKER)).balance).toBe(SEED_CREDITS)
      expect(ledger.entries).toHaveLength(1)
    })
  })

  describe('escrowForMission (CRED-3)', () => {
    it('moves the credits into escrow and leaves the total unchanged', async () => {
      await seededMaker()

      expect(
        (
          await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 2 })
        ).isOk(),
      ).toBe(true)

      const state = await credits.stateOf(MAKER)
      expect(state).toMatchObject({ balance: 0, escrowed: 2 })
    })

    it('refuses more than the balance and writes nothing', async () => {
      await seededMaker()

      const outcome = await credits.escrowForMission({
        accountId: MAKER,
        missionId: MISSION,
        credits: 3,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('CREDIT_INSUFFICIENT')
      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: SEED_CREDITS, escrowed: 0 })
      expect(ledger.entries).toHaveLength(1)
    })

    it('refuses an account with nothing at all', async () => {
      const outcome = await credits.escrowForMission({
        accountId: MAKER,
        missionId: MISSION,
        credits: 1,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('CREDIT_INSUFFICIENT')
      expect(ledger.entries).toEqual([])
    })

    it.each([0, -1, 1.5])('refuses %s credits', async (amount) => {
      await seededMaker()

      const outcome = await credits.escrowForMission({
        accountId: MAKER,
        missionId: MISSION,
        credits: amount,
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('CREDIT_INVALID_AMOUNT')
    })

    it('is a no-op on replay for the same mission', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })

      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 1, escrowed: 1 })
    })

    it('still escrows for a different mission', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })

      await credits.escrowForMission({ accountId: MAKER, missionId: OTHER_MISSION, credits: 1 })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 0, escrowed: 2 })
    })
  })

  describe('settleSlot (CRED-4)', () => {
    beforeEach(async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 2 })
    })

    it('pays the feedbacker and counts it both ways (CRED-7)', async () => {
      await credits.settleSlot({
        feedbackId: FEEDBACK,
        to: 'feedbacker',
        makerId: MAKER,
        feedbackerId: FEEDBACKER,
      })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 0, escrowed: 1, given: 1 })
      expect(await credits.stateOf(FEEDBACKER)).toMatchObject({ balance: 1, received: 1, given: 0 })
    })

    it('returns the credit to the maker on a rejection, counting nothing', async () => {
      await credits.settleSlot({
        feedbackId: FEEDBACK,
        to: 'maker',
        makerId: MAKER,
        feedbackerId: FEEDBACKER,
      })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 1, escrowed: 1, given: 0 })
      expect(await credits.stateOf(FEEDBACKER)).toMatchObject({ balance: 0, received: 0 })
    })

    it('is a no-op on replay, on both sides', async () => {
      const settle = () =>
        credits.settleSlot({
          feedbackId: FEEDBACK,
          to: 'feedbacker',
          makerId: MAKER,
          feedbackerId: FEEDBACKER,
        })
      await settle()

      await settle()

      expect(await credits.stateOf(MAKER)).toMatchObject({ escrowed: 1, given: 1 })
      expect(await credits.stateOf(FEEDBACKER)).toMatchObject({ balance: 1, received: 1 })
    })
  })

  describe('refundUnfilled (CRED-5)', () => {
    it('returns escrow for slots nobody took', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 2 })

      await credits.refundUnfilled({ makerId: MAKER, missionId: MISSION, credits: 2 })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 2, escrowed: 0 })
    })

    it('is a no-op on replay', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 2 })
      await credits.refundUnfilled({ makerId: MAKER, missionId: MISSION, credits: 2 })

      await credits.refundUnfilled({ makerId: MAKER, missionId: MISSION, credits: 2 })

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 2, escrowed: 0 })
    })
  })

  describe('voidAccount (CRED-8)', () => {
    it('zeroes both the balance and the escrow', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })

      await credits.voidAccount(MAKER)

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 0, escrowed: 0 })
    })

    it('leaves the counters standing, since they record what already happened', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })
      await credits.settleSlot({
        feedbackId: FEEDBACK,
        to: 'feedbacker',
        makerId: MAKER,
        feedbackerId: FEEDBACKER,
      })

      await credits.voidAccount(MAKER)

      expect(await credits.stateOf(MAKER)).toMatchObject({ balance: 0, escrowed: 0, given: 1 })
    })

    it('writes nothing for an account that holds nothing', async () => {
      await credits.voidAccount(MAKER)

      expect(ledger.entries).toEqual([])
    })

    it('is a no-op on replay', async () => {
      await seededMaker()
      await credits.voidAccount(MAKER)

      await credits.voidAccount(MAKER)

      expect(ledger.entries.filter((entry) => entry.type === 'void')).toHaveLength(1)
    })
  })

  describe('the summary it reports (CRED-7)', () => {
    it('carries the three public counters and never the escrow', async () => {
      await seededMaker()
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 1 })

      const summary = await credits.summaryFor(MAKER)

      expect(summary).toEqual({ balance: 1, received: 0, given: 0 })
      expect(summary).not.toHaveProperty('escrowed')
    })

    it('answers for several accounts at once, zero for one it has never seen', async () => {
      await seededMaker()

      const summaries = await credits.summariesFor([MAKER, FEEDBACKER])

      expect(summaries.get(MAKER)).toMatchObject({ balance: SEED_CREDITS })
      expect(summaries.get(FEEDBACKER)).toEqual({ balance: 0, received: 0, given: 0 })
    })
  })

  describe('the invariant (CRED constraints)', () => {
    it('holds after a full lifecycle: balance + escrowed equals what the log says', async () => {
      await seededMaker()
      await credits.grantSeed(FEEDBACKER)
      await credits.escrowForMission({ accountId: MAKER, missionId: MISSION, credits: 2 })
      await credits.settleSlot({
        feedbackId: FEEDBACK,
        to: 'feedbacker',
        makerId: MAKER,
        feedbackerId: FEEDBACKER,
      })
      await credits.refundUnfilled({ makerId: MAKER, missionId: MISSION, credits: 1 })

      for (const accountId of [MAKER, FEEDBACKER]) {
        const state = await credits.stateOf(accountId)
        const recomputed = await ledger.recompute(accountId)

        expect({
          balance: state.balance,
          escrowed: state.escrowed,
          received: state.received,
          given: state.given,
        }).toEqual(recomputed)
      }
    })
  })
})
