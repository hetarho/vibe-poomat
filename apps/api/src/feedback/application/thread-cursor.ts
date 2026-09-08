import { EntityId } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'
import type { ThreadCursorKeys } from '../domain/reply.repository'

export class ThreadCursorNotAllowedError extends ValidationError {
  override readonly code = 'THREAD_CURSOR_NOT_ALLOWED'
}

const SEPARATOR = '.'

/**
 * The cursor carries the sort keys rather than an offset (ARCH-17): a reply
 * posted between two requests shifts every offset by one, and the reader would
 * either skip a message or read it twice.
 *
 * It is opaque — base64url of the keys — so no client comes to depend on what
 * the ordering happens to be today.
 */
export function encodeThreadCursor(keys: ThreadCursorKeys): string {
  const payload = [keys.createdAt.getTime(), keys.id].join(SEPARATOR)

  return Buffer.from(payload, 'utf8').toString('base64url')
}

export function decodeThreadCursor(
  cursor: string,
): Result<ThreadCursorKeys, ThreadCursorNotAllowedError> {
  let decoded: string
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return err(new ThreadCursorNotAllowedError('cursor is not readable'))
  }

  const parts = decoded.split(SEPARATOR)
  if (parts.length !== 2) return err(new ThreadCursorNotAllowedError('cursor is malformed'))

  const [createdAt, id] = parts as [string, string]
  const millis = Number(createdAt)
  if (!Number.isFinite(millis)) {
    return err(new ThreadCursorNotAllowedError('cursor does not carry an instant'))
  }
  // the id is checked because it reaches a query: a cursor is caller-supplied
  if (!EntityId.isValid(id)) {
    return err(new ThreadCursorNotAllowedError('cursor does not name a reply'))
  }

  return ok({ createdAt: new Date(millis), id })
}
