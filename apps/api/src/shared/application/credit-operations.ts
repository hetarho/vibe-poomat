import type { DomainError, Result } from '../result'

export const CREDIT_OPERATIONS = Symbol('CREDIT_OPERATIONS')

/**
 * The credit ledger's published surface: the named movements another context may
 * ask for (CRED-3, CRED-4, CRED-5, CRED-8). There is deliberately no generic
 * transfer and no adjustment, because the product has neither (CRED-1, CRED-10),
 * and no `grantSeed` — creating credits is the credit context's own business.
 *
 * The error channel is the shared `DomainError` rather than the ledger's own
 * classes: a caller only forwards what came back, and the `code` that reaches
 * the client is the ledger's either way (ARCH-17).
 */
export type CreditOperations = {
  escrowForMission(input: {
    accountId: string
    missionId: string
    credits: number
  }): Promise<Result<void, DomainError>>
  settleSlot(input: {
    feedbackId: string
    to: 'feedbacker' | 'maker'
    makerId: string
    feedbackerId: string
  }): Promise<Result<void, DomainError>>
  refundUnfilled(input: {
    makerId: string
    missionId: string
    credits: number
  }): Promise<Result<void, DomainError>>
  voidAccount(accountId: string): Promise<Result<void, DomainError>>
}
