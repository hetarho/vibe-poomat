import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { apiClient } from '../../../shared/api'

/**
 * AUTH-9 runs inline rather than as a job, so this returns when it is actually
 * done. Nothing in the cache belongs to anybody afterwards, so all of it goes.
 */
export function useDeleteAccount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (confirm: string) => {
      const client = await apiClient()
      await client.DELETE('/api/v1/users/me', { body: { confirm } })
    },
    onSuccess: () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null)
      queryClient.clear()
    },
  })
}
