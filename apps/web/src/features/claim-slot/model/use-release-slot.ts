import { useMutation, useQueryClient } from '@tanstack/react-query'
import { myClaimQueryKey } from '../../../entities/feedback'
import { missionQueryKey, projectMissionsQueryKey } from '../../../entities/mission'
import { FEED_QUERY_ROOT } from '../../../entities/project'
import { apiClient } from '../../../shared/api'

/**
 * FDBK-1: giving the slot back before submitting. The same caches move as when
 * it was taken, the other way — and the claim goes to null rather than being
 * refetched, because there is nothing left to fetch.
 */
export function useReleaseSlot(missionId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (claimId: string): Promise<void> => {
      const client = await apiClient()
      await client.DELETE('/api/v1/claims/{id}', { params: { path: { id: claimId } } })
    },
    onSuccess: () => {
      queryClient.setQueryData(myClaimQueryKey(missionId), null)
      void queryClient.invalidateQueries({ queryKey: missionQueryKey(missionId) })
      void queryClient.invalidateQueries({ queryKey: projectMissionsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
    },
  })
}
