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
