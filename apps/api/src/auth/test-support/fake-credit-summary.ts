import type { CreditSummary, CreditSummaryReader } from '../../shared/application'
import { EMPTY_CREDIT_SUMMARY } from '../../shared/application'

/**
 * The credit context's read port, stubbed. A profile test cares that the numbers
 * arrive on the response, not where they came from — the ledger proves itself in
 * its own tests.
 */
export class FakeCreditSummaryReader implements CreditSummaryReader {
  constructor(private readonly summaries = new Map<string, CreditSummary>()) {}

  set(accountId: string, summary: CreditSummary): void {
    this.summaries.set(accountId, summary)
  }

  async summaryFor(accountId: string): Promise<CreditSummary> {
    return this.summaries.get(accountId) ?? EMPTY_CREDIT_SUMMARY
  }

  async summariesFor(accountIds: readonly string[]): Promise<Map<string, CreditSummary>> {
    return new Map(accountIds.map((id) => [id, this.summaries.get(id) ?? EMPTY_CREDIT_SUMMARY]))
  }
}
