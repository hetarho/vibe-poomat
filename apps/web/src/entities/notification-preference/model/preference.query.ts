import type { notifications } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiClient, asBody } from '../../../shared/api'

export const NOTIFICATION_PREFERENCES_KEY = ['notifications', 'preferences'] as const

const NONE: notifications.NotificationPreferences = { items: [] }

/** NOTI-3's rows, one per type, each saying whether it may be switched off. */
export function notificationPreferencesQueryOptions(headers?: Record<string, string>) {
  return queryOptions({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: async (): Promise<notifications.NotificationPreferences> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/notifications/preferences')

      return asBody<notifications.NotificationPreferences>(data, NONE)
    },
  })
}
