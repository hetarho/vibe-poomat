import { EntityId } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'

export class ReceivedCursorNotAllowedError extends ValidationError {
  override readonly code = 'FEEDBACK_CURSOR_NOT_ALLOWED'
}

export type ReceivedCursorKeys = {
  /** Whether that row was still waiting on a decision: the first sort key. */
  pending: boolean
  id: string
}

const SEPARATOR = '.'

/**
 * The inbox is ordered by "still waiting on you" and then by time, so the cursor
 * has to carry both — an id alone cannot say where in a two-key order a page
 * stopped. Opaque, like every other cursor here (ARCH-17), so nothing outside
 * comes to depend on the ordering being what it is today.
 */
export function encodeReceivedCursor(keys: ReceivedCursorKeys): string {
  return Buffer.from([keys.pending ? '1' : '0', keys.id].join(SEPARATOR), 'utf8').toString(
    'base64url',
  )
}

export function decodeReceivedCursor(
  cursor: string,
): Result<ReceivedCursorKeys, ReceivedCursorNotAllowedError> {
  let decoded: string
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return err(new ReceivedCursorNotAllowedError('cursor is not readable'))
  }

  const parts = decoded.split(SEPARATOR)
  if (parts.length !== 2) return err(new ReceivedCursorNotAllowedError('cursor is malformed'))

  const [pending, id] = parts as [string, string]
  if (pending !== '0' && pending !== '1') {
    return err(new ReceivedCursorNotAllowedError('cursor does not say where it stopped'))
  }
  // checked because it reaches a query, and a cursor is caller-supplied
  if (!EntityId.isValid(id)) {
    return err(new ReceivedCursorNotAllowedError('cursor does not name a report'))
  }

  return ok({ pending: pending === '1', id })
}
