import type { NotificationType } from './notification-type'

export const PREFERENCE_REPOSITORY = Symbol('PREFERENCE_REPOSITORY')

export type PreferenceRepository = {
  /**
   * Only the rows somebody has actually changed. A missing row means enabled,
   * so nothing has to be backfilled when a new type is added (NOTI-2).
   */
  settingsFor(userId: string): Promise<Map<NotificationType, boolean>>
  set(userId: string, type: NotificationType, enabled: boolean): Promise<void>
}
