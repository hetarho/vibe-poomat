export const CREDIT_SUMMARY_READER = Symbol('CREDIT_SUMMARY_READER')

/** The three counters CRED-7 puts on a public profile. */
export type CreditSummary = {
  balance: number
  received: number
  given: number
}

export const EMPTY_CREDIT_SUMMARY: CreditSummary = { balance: 0, received: 0, given: 0 }

/**
 * A read another context may perform on the credit ledger. It is declared here,
 * beside the infrastructure ports, because the layering rule lets a context
 * reach another only through its module file — so the *contract* between them
 * has to sit somewhere both can see, phrased as what the consumer needs rather
 * than as anything about how the ledger stores it (ARCH-10).
 */
export type CreditSummaryReader = {
  summaryFor(accountId: string): Promise<CreditSummary>
  /** One query for a page of profiles, so a feed never becomes N of them. */
  summariesFor(accountIds: readonly string[]): Promise<Map<string, CreditSummary>>
}
