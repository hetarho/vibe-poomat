import { EntityId } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'
import type { FeedCursorKeys } from '../domain/feed.query'

export class FeedCursorNotAllowedError extends ValidationError {
  override readonly code = 'FEED_CURSOR_NOT_ALLOWED'
}

const SEPARATOR = '.'

/**
 * The cursor carries the sort keys and the id, never an offset: a project
 * inserted between two requests shifts every offset by one and would make a
 * reader either skip a card or see it twice (ARCH-17).
 *
 * It is opaque on purpose — base64url of the keys — so a client cannot come to
 * depend on what the ordering happens to be today.
 */
export function encodeFeedCursor(keys: FeedCursorKeys): string {
  const payload = [keys.rank, keys.primary, keys.secondary, keys.id].join(SEPARATOR)

  return Buffer.from(payload, 'utf8').toString('base64url')
}

export function decodeFeedCursor(
  cursor: string,
): Result<FeedCursorKeys, FeedCursorNotAllowedError> {
  let decoded: string
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return err(new FeedCursorNotAllowedError('cursor is not readable'))
  }

  const parts = decoded.split(SEPARATOR)
  if (parts.length !== 4) return err(new FeedCursorNotAllowedError('cursor is malformed'))

  const [rank, primary, secondary, id] = parts as [string, string, string, string]
  const numbers = [Number(rank), Number(primary), Number(secondary)]
  if (numbers.some((value) => !Number.isFinite(value))) {
    return err(new FeedCursorNotAllowedError('cursor keys are not numbers'))
  }
  // the id is checked because it reaches a query: a cursor is caller-supplied
  if (!EntityId.isValid(id)) {
    return err(new FeedCursorNotAllowedError('cursor does not name a project'))
  }

  return ok({
    rank: numbers[0] as number,
    primary: numbers[1] as number,
    secondary: numbers[2] as number,
    id,
  })
}
