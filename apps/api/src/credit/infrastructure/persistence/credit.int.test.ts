import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TRANSACTION_MANAGER, type TransactionManager } from '../../../shared/application'
import { ConfigModule } from '../../../shared/config/config.module'
import { DbModule } from '../../../shared/db/db.module'
import { DB, type Db } from '../../../shared/db/db.token'
import { EventsModule } from '../../../shared/events/events.module'
import { HealthModule } from '../../../shared/health/health.module'
import { EntityId } from '../../../shared/kernel'
import { CreditLedgerService } from '../../application/credit-ledger.service'
import { CreditModule } from '../../credit.module'
import { CREDIT_LEDGER, type CreditLedger } from '../../domain/credit-ledger.repository'
import { SEED_CREDITS } from '../../domain/ledger-entry'

function id(): string {
  return EntityId.generate().value
}

describe('the credit ledger, against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let credits: CreditLedgerService
  let ledger: CreditLedger
  let transactions: TransactionManager
  let db: Db

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule, CreditModule],
    }).compile()
    await moduleRef.init()

    credits = moduleRef.get(CreditLedgerService)
    ledger = moduleRef.get<CreditLedger>(CREDIT_LEDGER)
    transactions = moduleRef.get<TransactionManager>(TRANSACTION_MANAGER)
    db = moduleRef.get<Db>(DB)
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  /** The cached row has to say exactly what the entries alone add up to (CRED-6). */
  async function expectCacheMatchesLog(accountId: string): Promise<void> {
    const [state, recomputed] = await Promise.all([
      credits.stateOf(accountId),
      transactions.run(async () => ledger.recompute(accountId)),
    ])

    expect({
      balance: state.balance,
      escrowed: state.escrowed,
      received: state.received,
      given: state.given,
    }).toEqual(recomputed)
  }

  it('writes one entry and one cached row per movement', async () => {
    const account = id()

    await credits.grantSeed(account)

    const entries = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from ledger_entries where account_id = ${account}`,
    )
    expect(entries.rows[0]?.count).toBe('1')
    expect(await credits.stateOf(account)).toMatchObject({ balance: SEED_CREDITS, escrowed: 0 })
    await expectCacheMatchesLog(account)
  })

  it('is a no-op on replay, because the operation key already exists', async () => {
    const account = id()
    await credits.grantSeed(account)

    await credits.grantSeed(account)

    const entries = await db.execute<{ count: string }>(
      sql`select count(*)::text as count from ledger_entries where account_id = ${account}`,
    )
    expect(entries.rows[0]?.count).toBe('1')
    expect((await credits.stateOf(account)).balance).toBe(SEED_CREDITS)
  })

  it('refuses to escrow more than the balance, and writes nothing', async () => {
    const account = id()
    await credits.grantSeed(account)

    const outcome = await credits.escrowForMission({
      accountId: account,
      missionId: id(),
      credits: SEED_CREDITS + 1,
    })

    expect(outcome._unsafeUnwrapErr().code).toBe('CREDIT_INSUFFICIENT')
    expect(await credits.stateOf(account)).toMatchObject({ balance: SEED_CREDITS, escrowed: 0 })
  })

  it('holds the invariant across a randomised run over several accounts', async () => {
    const accounts = [id(), id(), id(), id()]
    const missions = new Map<string, { maker: string; credits: number; settled: number }>()
    // deterministic, so a failure is reproducible rather than a story about luck
    let seed = 20260908
    const next = (bound: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648

      return seed % bound
    }

    for (const account of accounts) await credits.grantSeed(account)

    for (let step = 0; step < 120; step++) {
      const account = accounts[next(accounts.length)] ?? accounts[0]
      if (account === undefined) break

      switch (next(5)) {
        case 0: {
          // opening a mission, for whatever the account can actually cover
          const balance = (await credits.stateOf(account)).balance
          if (balance === 0) break
          const amount = 1 + next(balance)
          const missionId = id()
          const escrowed = await credits.escrowForMission({
            accountId: account,
            missionId,
            credits: amount,
          })
          if (escrowed.isOk())
            missions.set(missionId, { maker: account, credits: amount, settled: 0 })
          break
        }
        case 1:
        case 2: {
          // settling one slot of some open mission, to whoever is not the maker
          const open = [...missions].find(([, mission]) => mission.settled < mission.credits)
          if (open === undefined) break
          const [missionId, mission] = open
          const feedbacker = accounts.find((candidate) => candidate !== mission.maker)
          if (feedbacker === undefined) break
          await credits.settleSlot({
            feedbackId: id(),
            to: next(2) === 0 ? 'feedbacker' : 'maker',
            makerId: mission.maker,
            feedbackerId: feedbacker,
          })
          missions.set(missionId, { ...mission, settled: mission.settled + 1 })
          break
        }
        case 3: {
          // closing a mission and returning what nobody took
          const open = [...missions].find(([, mission]) => mission.settled < mission.credits)
          if (open === undefined) break
          const [missionId, mission] = open
          await credits.refundUnfilled({
            makerId: mission.maker,
            missionId,
            credits: mission.credits - mission.settled,
          })
          missions.set(missionId, { ...mission, settled: mission.credits })
          break
        }
        default: {
          // a replay of something that already happened, which must change nothing
          await credits.grantSeed(account)
          break
        }
      }
    }

    for (const account of accounts) {
      await expectCacheMatchesLog(account)

      const state = await credits.stateOf(account)
      expect(state.balance).toBeGreaterThanOrEqual(0)
      expect(state.escrowed).toBeGreaterThanOrEqual(0)
    }

    // credits are never created except by seed and never destroyed except by
    // void, so the whole system still holds exactly what it was granted
    const totals = await db.execute<{ total: string; seeded: string }>(sql`
      select
        coalesce(sum(balance_delta + escrow_delta), 0)::text as total,
        coalesce(sum(case when type = 'seed' then balance_delta else 0 end), 0)::text as seeded
      from ledger_entries
      where account_id = any(${sql`ARRAY[${sql.join(
        accounts.map((account) => sql`${account}`),
        sql`, `,
      )}]::uuid[]`})
    `)
    expect(totals.rows[0]?.total).toBe(totals.rows[0]?.seeded)
  })

  it('voids whatever is left, and leaves the log able to explain it', async () => {
    const account = id()
    await credits.grantSeed(account)
    await credits.escrowForMission({ accountId: account, missionId: id(), credits: 1 })

    await credits.voidAccount(account)

    expect(await credits.stateOf(account)).toMatchObject({ balance: 0, escrowed: 0 })
    await expectCacheMatchesLog(account)
  })

  describe('two missions opening against one balance', () => {
    it('lets exactly one through, and tells the other it cannot afford it', async () => {
      const account = id()
      await credits.grantSeed(account)

      // both ask for the whole balance at the same time; the row lock is what
      // stops them both seeing it as unspent
      const outcomes = await Promise.all([
        credits.escrowForMission({ accountId: account, missionId: id(), credits: SEED_CREDITS }),
        credits.escrowForMission({ accountId: account, missionId: id(), credits: SEED_CREDITS }),
      ])

      expect(outcomes.filter((outcome) => outcome.isOk())).toHaveLength(1)
      const refused = outcomes.find((outcome) => outcome.isErr())
      expect(refused?._unsafeUnwrapErr().code).toBe('CREDIT_INSUFFICIENT')
      expect(await credits.stateOf(account)).toMatchObject({
        balance: 0,
        escrowed: SEED_CREDITS,
      })
      await expectCacheMatchesLog(account)
    })
  })

  describe('the ledger page', () => {
    it('walks newest first and stops with a null cursor', async () => {
      const account = id()
      await credits.grantSeed(account)
      // two, because the seed is two credits and a third escrow would be refused
      for (let index = 0; index < SEED_CREDITS; index++) {
        await credits.escrowForMission({ accountId: account, missionId: id(), credits: 1 })
      }

      const first = await transactions.run(async () => ledger.page(account, { limit: 2 }))
      expect(first.entries).toHaveLength(2)
      expect(first.entries.every((entry) => entry.type === 'escrow')).toBe(true)
      expect(first.nextCursor).not.toBeNull()

      const second = await transactions.run(async () =>
        ledger.page(account, { limit: 2, cursor: first.nextCursor ?? undefined }),
      )
      expect(second.entries.map((entry) => entry.type)).toEqual(['seed'])
      expect(second.nextCursor).toBeNull()
    })
  })
})
