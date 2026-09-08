import { ConflictError, NotFoundError, ValidationError } from '../../shared/result'

/**
 * Codes are public API (ARCH-17). Ownership refusals keep the kernel's generic
 * `FORBIDDEN`, because the answer means the same thing on every resource; the
 * ones below say something only this context can.
 */
export class ProjectNotFoundError extends NotFoundError {
  override readonly code = 'PROJECT_NOT_FOUND'
}

/** PROJ-2: the first person to click it must actually be able to use it. */
export class ProjectUrlUnreachableError extends ValidationError {
  override readonly code = 'PROJECT_URL_UNREACHABLE'
}

/**
 * PROJ-7 and PROJ-8: while a mission is open, feedback has to match what the
 * feedbackers were sent to look at, so the URL is frozen and the project cannot
 * be deleted out from under them.
 */
export class ProjectLockedByMissionError extends ConflictError {
  override readonly code = 'PROJECT_LOCKED_BY_MISSION'
}

export class TitleNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_TITLE_NOT_ALLOWED'
}

export class PitchNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_PITCH_NOT_ALLOWED'
}

export class DescriptionNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_DESCRIPTION_NOT_ALLOWED'
}

export class LiveUrlNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_URL_NOT_ALLOWED'
}

export class TagsNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_TAGS_NOT_ALLOWED'
}

export class CoverNotAllowedError extends ValidationError {
  override readonly code = 'PROJECT_COVER_NOT_ALLOWED'
}
