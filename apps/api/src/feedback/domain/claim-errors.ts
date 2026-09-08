import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/result'

export class ClaimNotFoundError extends NotFoundError {
  override readonly code = 'CLAIM_NOT_FOUND'
}

/** FDBK-1: a mission that has ended is not taking feedback. */
export class MissionNotOpenError extends ConflictError {
  override readonly code = 'MISSION_NOT_OPEN'
}

/** FDBK-2: the one person who cannot give feedback on it. */
export class OwnProjectError extends ForbiddenError {
  override readonly code = 'OWN_PROJECT'
}

/** FDBK-2: at most one live claim per account per mission. */
export class AlreadyClaimedError extends ConflictError {
  override readonly code = 'ALREADY_CLAIMED'
}

/** Every slot is held, submitted or settled — there is nothing left to take. */
export class NoSlotsAvailableError extends ConflictError {
  override readonly code = 'NO_SLOTS_AVAILABLE'
}

/** Releasing or submitting something that is no longer held. */
export class ClaimNotHeldError extends ConflictError {
  override readonly code = 'CLAIM_NOT_HELD'
}

export class FeedbackNotFoundError extends NotFoundError {
  override readonly code = 'FEEDBACK_NOT_FOUND'
}

/** FDBK-4: a settled report is finished; there is nothing left to decide. */
export class FeedbackNotPendingError extends ConflictError {
  override readonly code = 'FEEDBACK_ALREADY_SETTLED'
}

/** One report per slot: a retried submit finds the first one already there. */
export class FeedbackAlreadySubmittedError extends ConflictError {
  override readonly code = 'FEEDBACK_ALREADY_SUBMITTED'
}

/** FDBK-1: the hold ran out before anything was submitted. */
export class ClaimExpiredError extends ConflictError {
  override readonly code = 'CLAIM_EXPIRED'
}
