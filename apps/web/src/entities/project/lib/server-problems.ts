import { ApiError, fieldErrors } from '../../../shared/api'

/**
 * Which field a refusal belongs to. The api answers a bad field with its own
 * code (ARCH-17) rather than a validation map, so the map from code to field
 * lives here — one place, shared by the create and the edit form, because a
 * banner saying "something was wrong" wastes what the api actually said.
 */
const FIELD_BY_CODE: Readonly<Record<string, string>> = {
  PROJECT_TITLE_NOT_ALLOWED: 'title',
  PROJECT_PITCH_NOT_ALLOWED: 'pitch',
  PROJECT_DESCRIPTION_NOT_ALLOWED: 'description',
  PROJECT_URL_NOT_ALLOWED: 'liveUrl',
  PROJECT_URL_UNREACHABLE: 'liveUrl',
  PROJECT_TAGS_NOT_ALLOWED: 'tags',
  PROJECT_COVER_NOT_ALLOWED: 'cover',
  PROJECT_LOCKED_BY_MISSION: 'liveUrl',
}

const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  PROJECT_TITLE_NOT_ALLOWED: 'The server refused that title.',
  PROJECT_PITCH_NOT_ALLOWED: 'The server refused that pitch.',
  PROJECT_DESCRIPTION_NOT_ALLOWED: 'The server refused that description.',
  PROJECT_URL_NOT_ALLOWED: 'The server refused that URL. It must be an https address.',
  PROJECT_TAGS_NOT_ALLOWED: 'The server refused those tags.',
  PROJECT_COVER_NOT_ALLOWED: 'That cover upload was not accepted. Pick the image again.',
  PROJECT_LOCKED_BY_MISSION: 'The live URL cannot change while a mission is open.',
}

/** The status the probe actually observed, when it got one (PROJ-2). */
function observedStatus(details: unknown): number | null {
  if (typeof details !== 'object' || details === null || !('status' in details)) return null
  const status = (details as { status: unknown }).status

  return typeof status === 'number' ? status : null
}

function unreachableMessage(error: ApiError): string {
  const status = observedStatus(error.details)

  return status === null
    ? 'That URL could not be opened from the server. Check that it is public and try again.'
    : `That URL answered ${status} when the server opened it. It has to work for a stranger.`
}

/**
 * What the api said about each field, keyed by field name. A validation failure
 * from the request schema already arrives as a map (T006); a domain refusal
 * arrives as one code, which names exactly one field.
 */
export function serverProblems(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  if (error.code === 'VALIDATION_FAILED') return fieldErrors(error)

  const field = FIELD_BY_CODE[error.code]
  if (field === undefined) return {}

  const message =
    error.code === 'PROJECT_URL_UNREACHABLE'
      ? unreachableMessage(error)
      : (MESSAGE_BY_CODE[error.code] ?? 'The server refused that.')

  return { [field]: message }
}
