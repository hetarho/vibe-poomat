import type { auth } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { profileQueryKey } from '../../../entities/user'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * AUTH-6: the old handle is released the moment this succeeds, so every link to
 * it stops working — there is no redirect. The copy beside the field says so.
 */
export function useChangeHandle() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (handle: string): Promise<auth.PublicProfile> => {
      const client = await apiClient()
      const { data } = await client.PATCH('/api/v1/users/me/handle', { body: { handle } })

      return expectBody<auth.PublicProfile>(data)
    },
    onSuccess: (profile, previousHandle) => {
      // the old key names a handle nobody holds now, so it is dropped rather
      // than left to answer with a profile that has moved
      queryClient.removeQueries({ queryKey: profileQueryKey(previousHandle) })
      queryClient.setQueryData(profileQueryKey(profile.handle), profile)
      queryClient.setQueryData(SESSION_QUERY_KEY, (previous: auth.Me | null | undefined) =>
        previous === null || previous === undefined ? previous : { ...previous, ...profile },
      )
    },
  })
}
