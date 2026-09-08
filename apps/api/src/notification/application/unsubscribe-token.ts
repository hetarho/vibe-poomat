import { createHmac, timingSafeEqual } from 'node:crypto'
import { err, ok, type Result } from '../../shared/result'
import { UnsubscribeTokenNotAllowedError } from '../domain/notification-errors'
import { isNotificationType, type NotificationType } from '../domain/notification-type'

const SEPARATOR = '.'
const DIGEST = 'sha256'

export type UnsubscribeClaim = {
  userId: string
  type: NotificationType
}

/**
 * NOTI-4's unsubscribe link, which is clicked from a mail client with no session
 * behind it. The token is therefore the whole authority, so it is deliberately
 * the narrowest one that can exist: it names one account and one type, it can
 * only ever turn that type off, and it reveals nothing — the id it carries is
 * already in the URL of that person's own profile.
 *
 * There is no expiry. A link that stops working months later would leave someone
 * with no way out of an inbox, and rotating `NOTIFICATION_SECRET` is the lever
 * for invalidating every link at once.
 */
export class UnsubscribeToken {
  constructor(private readonly secret: string) {}

  sign(claim: UnsubscribeClaim): string {
    const payload = Buffer.from(`${claim.userId}${SEPARATOR}${claim.type}`, 'utf8').toString(
      'base64url',
    )

    return `${payload}${SEPARATOR}${this.mac(payload)}`
  }

  verify(token: string): Result<UnsubscribeClaim, UnsubscribeTokenNotAllowedError> {
    const parts = token.split(SEPARATOR)
    if (parts.length !== 2)
      return err(new UnsubscribeTokenNotAllowedError('this link is not valid'))

    const [payload, signature] = parts as [string, string]
    // compared over the whole digest, in constant time, so a wrong signature
    // gives away nothing about how nearly right it was
    if (!this.matches(payload, signature)) {
      return err(new UnsubscribeTokenNotAllowedError('this link is not valid'))
    }

    const claimed = Buffer.from(payload, 'base64url').toString('utf8').split(SEPARATOR)
    if (claimed.length !== 2)
      return err(new UnsubscribeTokenNotAllowedError('this link is not valid'))

    const [userId, type] = claimed as [string, string]
    if (!isNotificationType(type)) {
      return err(new UnsubscribeTokenNotAllowedError('this link is not valid'))
    }

    return ok({ userId, type })
  }

  private mac(payload: string): string {
    return createHmac(DIGEST, this.secret).update(payload).digest('base64url')
  }

  private matches(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.mac(payload), 'utf8')
    const given = Buffer.from(signature, 'utf8')
    // timingSafeEqual throws on a length mismatch, which would itself leak the
    // digest length, so the lengths are equalised before the comparison
    if (expected.length !== given.length) return false

    return timingSafeEqual(expected, given)
  }
}
