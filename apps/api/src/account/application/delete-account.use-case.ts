import type {
  AccountErasure,
  CreditOperations,
  FeedbackPurge,
  ProjectPurge,
  TransactionManager,
  UserSummaryReader,
} from '../../shared/application'
import {
  type DomainError,
  err,
  ForbiddenError,
  NotFoundError,
  ok,
  type Result,
  ValidationError,
} from '../../shared/result'

export class AccountNotFoundError extends NotFoundError {
  override readonly code = 'ACCOUNT_NOT_FOUND'
}

/** The typed confirmation AUTH-9's irreversibility earns. */
export class DeletionNotConfirmedError extends ValidationError {
  override readonly code = 'DELETION_NOT_CONFIRMED'
}

export type DeleteAccountError =
  | AccountNotFoundError
  | DeletionNotConfirmedError
  | ForbiddenError
  | DomainError

/**
 * The names of the steps, in the order AUTH-9 puts them. Exported because the
 * order *is* the decision: auto-accepting before voiding is the difference
 * between paying the people who did the work and taking their credits, and a
 * test asserts this list rather than trusting a reading of the code.
 */
export const DELETION_STEPS = [
  'release-held-slots',
  'end-missions',
  'settle-pending-feedback',
  'remove-projects',
  'anonymise-authored',
  'void-credits',
  'erase-account',
] as const

export type DeletionStep = (typeof DELETION_STEPS)[number]

export type DeletionReport = {
  userId: string
  handle: string
  /** In the order they ran, so a caller can see how far it got. */
  steps: DeletionStep[]
  missionsEnded: number
  feedbackSettled: number
}

/**
 * AUTH-9, in one transaction across four contexts — which is the case ARCH-38
 * was decided for. Each context is asked only for what it owns, through a port,
 * and this use case owns nothing but the order.
 *
 * It runs inline rather than as a job so the person sees the result of their own
 * decision immediately; the object-storage cleanup for their images is the one
 * part left to a best-effort job.
 */
export class DeleteAccountUseCase {
  constructor(
    private readonly users: UserSummaryReader,
    private readonly projects: ProjectPurge,
    private readonly feedback: FeedbackPurge,
    private readonly credits: CreditOperations,
    private readonly accounts: AccountErasure,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(input: {
    userId: string
    /** Must equal the account's own handle; anything else aborts (AUTH-9). */
    confirm: string
  }): Promise<Result<DeletionReport, DeleteAccountError>> {
    const summary = await this.users.summaryFor(input.userId)
    if (summary === null) return err(new AccountNotFoundError('no such account'))

    // checked before the transaction opens: a mistyped confirmation is not a
    // failure to roll back, it is a question that was never asked
    if (input.confirm.trim() !== summary.handle) {
      return err(
        new DeletionNotConfirmedError('type your handle exactly to confirm', {
          confirm: ['must match your handle'],
        }),
      )
    }

    return this.transactions.run(async () => {
      const steps: DeletionStep[] = []

      // their holds first, so the slots are usable by other people whatever
      // happens to the rest of this
      const released = await this.feedback.releaseHoldsOf(input.userId)
      if (released.isErr()) return err(released.error)
      steps.push('release-held-slots')

      // PROJ-6 and CRED-5: what nobody took comes back to the balance, which is
      // still theirs at this point and will be voided at the end
      const ended = await this.projects.endMissionsOf(input.userId)
      if (ended.isErr()) return err(ended.error)
      steps.push('end-missions')

      // CRED-4, and the reason the order matters: everybody who did the work is
      // paid out of the escrow before a single credit is voided
      const settled = await this.feedback.settlePendingFor(input.userId)
      if (settled.isErr()) return err(settled.error)
      steps.push('settle-pending-feedback')

      const removed = await this.projects.removeProjectsOf(input.userId)
      if (removed.isErr()) return err(removed.error)
      steps.push('remove-projects')

      // FDBK-9: what they gave other people survives them, without their name
      const anonymised = await this.feedback.anonymise(input.userId)
      if (anonymised.isErr()) return err(anonymised.error)
      steps.push('anonymise-authored')

      // CRED-8: whatever is left is destroyed rather than moved, and the ledger
      // says so, so CRED-6's invariant still holds afterwards
      const voided = await this.credits.voidAccount(input.userId)
      if (voided.isErr()) return err(voided.error)
      steps.push('void-credits')

      const erased = await this.accounts.eraseAccount(input.userId)
      if (erased.isErr()) return err(erased.error)
      steps.push('erase-account')

      return ok({
        userId: input.userId,
        handle: summary.handle,
        steps,
        missionsEnded: ended.value,
        feedbackSettled: settled.value,
      })
    })
  }
}
