import type { notifications } from '@repo/contracts'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, asBody, expectBody } from '../../../shared/api'

export const NOTIFICATION_PREFERENCES_KEY = ['notifications', 'preferences'] as const

export function notificationPreferencesQueryOptions(headers?: Record<string, string>) {
  return queryOptions({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: async (): Promise<notifications.NotificationPreferences> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/notifications/preferences')

      return asBody<notifications.NotificationPreferences>(data, { items: [] })
    },
  })
}

export function useNotificationPreferences() {
  return useQuery(notificationPreferencesQueryOptions())
}

/**
 * NOTI-3's toggles. The answer is the whole set, so the cache is set from it —
 * a toggle that the server refused must not be left looking as if it worked.
 */
export function useSetNotificationPreference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: notifications.UpdateNotificationPreferencesRequest) => {
      const client = await apiClient()
      const { data } = await client.PATCH('/api/v1/notifications/preferences', { body: change })

      return expectBody<notifications.NotificationPreferences>(data)
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, preferences)
    },
  })
}
