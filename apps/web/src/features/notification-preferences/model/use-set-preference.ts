import type { notifications } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NOTIFICATION_PREFERENCES_KEY } from '../../../entities/notification-preference'
import { apiClient, expectBody } from '../../../shared/api'

type Preferences = notifications.NotificationPreferences

function withRow(
  data: Preferences | undefined,
  type: notifications.NotificationType,
  enabled: boolean,
): Preferences | undefined {
  if (data === undefined) return data

  return {
    ...data,
    items: data.items.map((item) => (item.type === type ? { ...item, enabled } : item)),
  }
}

/**
 * One type at a time, moved on the press: a checkbox that only settles after a
 * round trip reads as a checkbox that did not take. The answer is the whole set,
 * so the server's version replaces the guess — and a refusal puts the row back
 * exactly as it was rather than leaving it looking as if it had worked.
 */
export function useSetNotificationPreference() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: {
      type: notifications.NotificationType
      enabled: boolean
    }): Promise<Preferences> => {
      const client = await apiClient()
      const { data } = await client.PATCH('/api/v1/notifications/preferences', {
        body: { [change.type]: change.enabled },
      })

      return expectBody<Preferences>(data)
    },
    onMutate: async (change) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY })

      const previous = queryClient.getQueryData<Preferences>(NOTIFICATION_PREFERENCES_KEY)
      queryClient.setQueryData<Preferences>(NOTIFICATION_PREFERENCES_KEY, (data) =>
        withRow(data, change.type, change.enabled),
      )

      return { previous }
    },
    onError: (_error, _change, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, context.previous)
      }
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, preferences)
    },
  })
}
