import type {
  CreditSummary,
  CreditSummaryReader,
  TransactionManager,
} from '../../shared/application'
import { err, ok, type Result } from '../../shared/result'
import { InsufficientCreditsError, InvalidCreditAmountError } from '../domain/credit-errors'
import type { CreditAccountState, CreditLedger } from '../domain/credit-ledger.repository'
import {
  escrowMovements,
  type LedgerMovement,
  refundUnfilledMovements,
  seedMovements,
  settleSlotMovements,
  voidMovements,
} from '../domain/ledger-entry'

export const CREDIT_SERVICE = Symbol('CREDIT_SERVICE')

export type CreditOperationError = InsufficientCreditsError | InvalidCreditAmountError

/**
 * Everything the ledger can be asked to do, and deliberately nothing more: there
 * is no generic `transfer(from, to)` here, because CRED-1 has no transfers —
 * every movement below is one of the named things the product actually does.
 *
 * Each operation locks the accounts it touches, writes its entries and folds
 * them into the cached row, all inside one transaction (ARCH-38). Each is
 * idempotent on its `(type, account, ref)` key, so a retry after a timeout is
 * safe and a redelivered job pays nobody twice.
 */
export class CreditLedgerService implements CreditSummaryReader {
  constructor(
    private readonly ledger: CreditLedger,
    private readonly transactions: TransactionManager,
  ) {}

  /** CRED-2, once per account. A replayed AccountCreated changes nothing. */
  async grantSeed(accountId: string): Promise<Result<void, CreditOperationError>> {
    return this.apply(seedMovements(accountId))
  }

  /** CRED-3: blocked when the balance cannot cover it, before anything is written. */
  async escrowForMission(input: {
    accountId: string
    missionId: string
    credits: number
  }): Promise<Result<void, CreditOperationError>> {
    return this.transactions.run(async () => {
      const amount = this.requirePositive(input.credits)
      if (amount.isErr()) return err(amount.error)

      const account = await this.ledger.lock(input.accountId)
      if (account.balance < input.credits) {
        return err(
          new InsufficientCreditsError('not enough credits to open this mission', {
            balance: account.balance,
            required: input.credits,
          }),
        )
      }

      // already locked above, so this only has to write
      for (const movement of escrowMovements(input.accountId, input.missionId, input.credits)) {
        await this.ledger.record(movement)
      }

      return ok(undefined)
    })
  }

  /** CRED-4, per slot: accepted work pays the feedbacker, a rejection refunds the maker. */
  async settleSlot(input: {
    feedbackId: string
    to: 'feedbacker' | 'maker'
    makerId: string
    feedbackerId: string
  }): Promise<Result<void, CreditOperationError>> {
    return this.apply(settleSlotMovements(input))
  }

  /** CRED-5: escrow held for slots nobody took goes back. */
  async refundUnfilled(input: {
    makerId: string
    missionId: string
    credits: number
  }): Promise<Result<void, CreditOperationError>> {
    const amount = this.requirePositive(input.credits)
    if (amount.isErr()) return err(amount.error)

    return this.apply(refundUnfilledMovements(input.makerId, input.missionId, input.credits))
  }

  /** CRED-8: whatever is left when an account goes stops existing. */
  async voidAccount(accountId: string): Promise<Result<void, CreditOperationError>> {
    return this.transactions.run(async () => {
      const account = await this.ledger.lock(accountId)

      return this.applyLocked(voidMovements(accountId, account.balance, account.escrowed))
    })
  }

  async stateOf(accountId: string): Promise<CreditAccountState> {
    return this.ledger.stateOf(accountId)
  }

  async summaryFor(accountId: string): Promise<CreditSummary> {
    return toSummary(await this.ledger.stateOf(accountId))
  }

  async summariesFor(accountIds: readonly string[]): Promise<Map<string, CreditSummary>> {
    const states = await this.ledger.statesFor(accountIds)

    return new Map([...states].map(([id, state]) => [id, toSummary(state)]))
  }

  private async apply(movements: LedgerMovement[]): Promise<Result<void, CreditOperationError>> {
    return this.transactions.run(async () => this.applyLocked(movements))
  }

  /**
   * Locks every account this touches before writing any of it, in a stable order
   * so two settlements involving the same pair cannot deadlock by taking them
   * the other way round.
   */
  private async applyLocked(
    movements: LedgerMovement[],
  ): Promise<Result<void, CreditOperationError>> {
    const accounts = [...new Set(movements.map((movement) => movement.accountId))].sort()
    for (const accountId of accounts) await this.ledger.lock(accountId)

    for (const movement of movements) await this.ledger.record(movement)

    return ok(undefined)
  }

  private requirePositive(credits: number): Result<number, InvalidCreditAmountError> {
    if (!Number.isInteger(credits) || credits <= 0) {
      return err(
        new InvalidCreditAmountError('credits must be a positive whole number', { credits }),
      )
    }

    return ok(credits)
  }
}

function toSummary(state: CreditAccountState): CreditSummary {
  return { balance: state.balance, received: state.received, given: state.given }
}
