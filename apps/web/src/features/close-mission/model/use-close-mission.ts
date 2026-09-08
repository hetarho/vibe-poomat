import type { projects } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MY_CREDITS_QUERY_KEY } from '../../../entities/credit'
import { projectMissionsQueryKey } from '../../../entities/mission'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * PROJ-6: the maker ends it early and CRED-5 hands back the slots nobody took.
 * The same four caches move as when it opened, in the other direction — and the
 * refunded number comes from the answer rather than being guessed here, because
 * a slot held and released between the render and the click changes it.
 */
export function useCloseMission(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (missionId: string): Promise<projects.Mission> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/missions/{id}/close', {
        params: { path: { id: missionId } },
      })

      return expectBody<projects.Mission>(data)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMissionsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
      void queryClient.invalidateQueries({ queryKey: MY_CREDITS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    },
  })
}
