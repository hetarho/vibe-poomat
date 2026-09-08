import type { CreditLedger, LedgerPage } from '../domain/credit-ledger.repository'

export const LEDGER_PAGE_SIZE = 20
const MAX_LEDGER_PAGE_SIZE = 100

export type MyCredits = {
  balance: number
  escrowed: number
  received: number
  given: number
  ledger: LedgerPage
}

/**
 * The owner's own view of their ledger (CRED-7): the counters everyone can see,
 * plus `escrowed` and the entries, which only they can. There is no endpoint
 * that shows anyone else's entries, and none that edits any of it (CRED-10).
 */
export class GetMyCreditsUseCase {
  constructor(private readonly ledger: CreditLedger) {}

  async execute(input: { accountId: string; cursor?: string; limit?: number }): Promise<MyCredits> {
    const limit = Math.min(Math.max(input.limit ?? LEDGER_PAGE_SIZE, 1), MAX_LEDGER_PAGE_SIZE)
    const [state, ledger] = await Promise.all([
      this.ledger.stateOf(input.accountId),
      this.ledger.page(input.accountId, { limit, cursor: input.cursor }),
    ])

    return {
      balance: state.balance,
      escrowed: state.escrowed,
      received: state.received,
      given: state.given,
      ledger,
    }
  }
}
