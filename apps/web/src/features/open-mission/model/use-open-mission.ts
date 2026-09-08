import type { projects } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MY_CREDITS_QUERY_KEY } from '../../../entities/credit'
import { projectMissionsQueryKey } from '../../../entities/mission'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * PROJ-4 with CRED-3's escrow, which the server does in one transaction. Four
 * things change at once and all of them are invalidated: the mission list, the
 * project (it now has an open mission, so PROJ-7 freezes fields), the feed (the
 * card gains claimable slots) and the balance the escrow came out of.
 */
export function useOpenMission(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: projects.OpenMissionRequest): Promise<projects.Mission> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/projects/{projectId}/missions', {
        params: { path: { projectId } },
        body: request,
      })

      return expectBody<projects.Mission>(data)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectMissionsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
      void queryClient.invalidateQueries({ queryKey: MY_CREDITS_QUERY_KEY })
      // the session carries the public counters too (CRED-7)
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    },
  })
}
