import { ConflictError, NotFoundError, ValidationError } from '../../shared/result'

export class MissionNotFoundError extends NotFoundError {
  override readonly code = 'MISSION_NOT_FOUND'
}

/** PROJ-5: one mission at a time, so scarce feedback is not spread thin. */
export class MissionAlreadyOpenError extends ConflictError {
  override readonly code = 'MISSION_ALREADY_OPEN'
}

/** Closing something that has already ended is a different thing from closing it. */
export class MissionNotOpenError extends ConflictError {
  override readonly code = 'MISSION_NOT_OPEN'
}

export class TaskTextNotAllowedError extends ValidationError {
  override readonly code = 'MISSION_TASK_NOT_ALLOWED'
}

export class QuestionsNotAllowedError extends ValidationError {
  override readonly code = 'MISSION_QUESTIONS_NOT_ALLOWED'
}

export class SlotsNotAllowedError extends ValidationError {
  override readonly code = 'MISSION_SLOTS_NOT_ALLOWED'
}
