import type { auth } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { profileQueryKey } from '../../../entities/user'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * A partial edit: whatever is absent is left alone, and an explicit null clears
 * a field. The answer is the whole profile, so the caches are set from it rather
 * than invalidated — the page shows what was actually saved, not what was typed.
 */
export function useEditProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (changes: auth.UpdateProfileRequest): Promise<auth.PublicProfile> => {
      const client = await apiClient()
      const { data } = await client.PATCH('/api/v1/users/me', { body: changes })

      return expectBody<auth.PublicProfile>(data)
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey(profile.handle), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, (previous: auth.Me | null | undefined) =>
        previous === null || previous === undefined ? previous : { ...previous, ...profile },
      )
    },
  })
}
