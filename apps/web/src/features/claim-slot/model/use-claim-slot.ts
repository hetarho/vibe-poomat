import type { feedback } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { myClaimQueryKey } from '../../../entities/feedback'
import { missionQueryKey, projectMissionsQueryKey } from '../../../entities/mission'
import { FEED_QUERY_ROOT } from '../../../entities/project'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * FDBK-1's Start. The claim is written into its own cache from the answer, so
 * the hold and its countdown appear without a second request; the mission and
 * the feed are invalidated because a slot has just stopped being takeable.
 */
export function useClaimSlot(missionId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<feedback.Claim> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/missions/{missionId}/claims', {
        params: { path: { missionId } },
      })

      return expectBody<feedback.Claim>(data)
    },
    onSuccess: (claim) => {
      queryClient.setQueryData(myClaimQueryKey(missionId), claim)
      void queryClient.invalidateQueries({ queryKey: missionQueryKey(missionId) })
      void queryClient.invalidateQueries({ queryKey: projectMissionsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
    },
  })
}
