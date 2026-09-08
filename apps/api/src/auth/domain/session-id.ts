import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { SessionIdNotAllowedError } from './auth-errors'

/** 32 random bytes in base64url, unpadded (ARCH-18). */
export const SESSION_ID_LENGTH = 43

/** A little room above the current length, so rotating the generator later needs no migration. */
const SESSION_ID_MAX_LENGTH = 64

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/

type SessionIdProps = { value: string }

/**
 * The opaque session token. It arrives from a cookie, so it is parsed rather
 * than trusted: rejecting the shape here keeps junk from ever reaching a query.
 */
export class SessionId extends ValueObject<SessionIdProps> {
  private constructor(props: SessionIdProps) {
    super(props)
  }

  static parse(raw: string): Result<SessionId, SessionIdNotAllowedError> {
    const value = raw.trim()

    if (value.length < SESSION_ID_LENGTH || value.length > SESSION_ID_MAX_LENGTH) {
      return err(new SessionIdNotAllowedError('session id length is out of range'))
    }

    if (!SESSION_ID_PATTERN.test(value)) {
      return err(new SessionIdNotAllowedError('session id is not base64url'))
    }

    return ok(new SessionId({ value }))
  }

  get value(): string {
    return this.props.value
  }

  override toString(): string {
    return this.props.value
  }
}
