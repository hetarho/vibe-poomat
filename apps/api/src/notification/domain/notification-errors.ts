import { ForbiddenError, ValidationError } from '../../shared/result'

/** NOTI-3: the warning moves credits, so it is not somebody's to switch off. */
export class NotificationAlwaysOnError extends ForbiddenError {
  override readonly code = 'NOTIFICATION_ALWAYS_ON'
}

/** A link that was not signed by this deployment, or was edited after it was. */
export class UnsubscribeTokenNotAllowedError extends ValidationError {
  override readonly code = 'UNSUBSCRIBE_TOKEN_NOT_ALLOWED'
}
