import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { apiClient } from '../../../shared/api'

/**
 * Ends the session and forgets who was signed in. The cached session is set to
 * null rather than invalidated, so the header changes in the same tick instead
 * of showing the old avatar until a refetch lands.
 */
export function useSignOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const client = await apiClient()
      await client.POST('/api/v1/auth/logout')
    },
    onSuccess: async () => {
      queryClient.setQueryData(SESSION_QUERY_KEY, null)
      // everything else on the page was read as that person, so none of it is
      // theirs to keep
      await queryClient.invalidateQueries()
    },
  })
}
