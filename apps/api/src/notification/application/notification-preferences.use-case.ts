import { err, ok, type Result } from '../../shared/result'
import {
  NotificationAlwaysOnError,
  UnsubscribeTokenNotAllowedError,
} from '../domain/notification-errors'
import {
  canBeDisabled,
  isNotificationType,
  NOTIFICATION_TYPES,
  type NotificationType,
} from '../domain/notification-type'
import type { PreferenceRepository } from '../domain/preference.repository'
import { UnsubscribeToken } from './unsubscribe-token'

export type PreferenceView = {
  type: NotificationType
  enabled: boolean
  /** NOTI-3: false for the warning, so the UI can render it as fixed rather than broken. */
  canDisable: boolean
}

export type PreferenceError = NotificationAlwaysOnError | UnsubscribeTokenNotAllowedError

/**
 * NOTI-3's settings. Every type is always returned, whether or not a row exists,
 * because "we have never heard from you about this one" and "you left it on" are
 * the same answer to the person reading the page.
 */
export class NotificationPreferencesUseCase {
  constructor(
    private readonly preferences: PreferenceRepository,
    private readonly tokens: UnsubscribeToken,
  ) {}

  async list(userId: string): Promise<PreferenceView[]> {
    const saved = await this.preferences.settingsFor(userId)

    return NOTIFICATION_TYPES.map((type) => ({
      type,
      // the warning reads as on however the row was left, because it is sent
      // regardless — showing it as off would be a lie about what will arrive
      enabled: canBeDisabled(type) ? saved.get(type) !== false : true,
      canDisable: canBeDisabled(type),
    }))
  }

  async update(
    userId: string,
    changes: Partial<Record<NotificationType, boolean>>,
  ): Promise<Result<PreferenceView[], PreferenceError>> {
    for (const [type, enabled] of Object.entries(changes)) {
      if (!isNotificationType(type)) continue
      if (enabled === false && !canBeDisabled(type)) {
        return err(
          new NotificationAlwaysOnError(
            'this notification moves credits and cannot be turned off',
            {
              type,
            },
          ),
        )
      }
    }

    for (const [type, enabled] of Object.entries(changes)) {
      if (!isNotificationType(type) || enabled === undefined) continue
      await this.preferences.set(userId, type, enabled)
    }

    return ok(await this.list(userId))
  }

  /**
   * NOTI-4's link, clicked with no session. It can only ever turn one type off:
   * there is no enable, no delete and nothing read back, so a leaked link costs
   * its owner one email type and nothing else.
   */
  async unsubscribe(
    token: string,
  ): Promise<Result<{ userId: string; type: NotificationType }, PreferenceError>> {
    const claim = this.tokens.verify(token)
    if (claim.isErr()) return err(claim.error)

    if (!canBeDisabled(claim.value.type)) {
      return err(
        new NotificationAlwaysOnError('this notification moves credits and cannot be turned off', {
          type: claim.value.type,
        }),
      )
    }

    await this.preferences.set(claim.value.userId, claim.value.type, false)

    return ok(claim.value)
  }
}
