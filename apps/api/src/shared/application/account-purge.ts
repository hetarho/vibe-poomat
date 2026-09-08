import type { DomainError, Result } from '../result'

/**
 * AUTH-9 deletes an account across four contexts in one transaction (ARCH-38),
 * so each context exposes what it can be asked to give up and nothing more. The
 * order they are called in is the whole substance of the decision, and it lives
 * with the use case that calls them — not here.
 *
 * Every one of these returns a `Result`: a failure has to abort the sequence
 * rather than leave an account half deleted.
 */

export const PROJECT_PURGE = Symbol('PROJECT_PURGE')

export type ProjectPurge = {
  /**
   * PROJ-6: ends every mission still taking feedback, refunding the slots
   * nobody took (CRED-5). Answers with how many it ended.
   */
  endMissionsOf(ownerId: string): Promise<Result<number, DomainError>>
  /** AUTH-9: the projects stop being anybody's to find. */
  removeProjectsOf(ownerId: string): Promise<Result<void, DomainError>>
}

export const FEEDBACK_PURGE = Symbol('FEEDBACK_PURGE')

export type FeedbackPurge = {
  /** FDBK-1: their holds go back, so other people can take those slots. */
  releaseHoldsOf(userId: string): Promise<Result<void, DomainError>>
  /**
   * CRED-4: every report still pending on this maker's projects is accepted, so
   * the people who did the work are paid before anything is voided. Keyed on the
   * maker rather than on a list of missions, because a mission that ended long
   * ago can still be holding a report nobody answered.
   */
  settlePendingFor(makerId: string): Promise<Result<number, DomainError>>
  /** FDBK-9: the reports and replies they wrote stay; the name on them does not. */
  anonymise(userId: string): Promise<Result<void, DomainError>>
}

export const ACCOUNT_ERASURE = Symbol('ACCOUNT_ERASURE')

export type AccountErasure = {
  /** Everything `auth` owns: the sessions, the provider identities, the row. */
  eraseAccount(userId: string): Promise<Result<void, DomainError>>
}
