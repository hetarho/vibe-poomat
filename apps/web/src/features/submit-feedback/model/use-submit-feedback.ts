import type { feedback } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { myClaimQueryKey, projectFeedbackQueryKey } from '../../../entities/feedback'
import { missionQueryKey, projectMissionsQueryKey } from '../../../entities/mission'
import { apiClient, expectBody } from '../../../shared/api'

type SubmitInput = {
  claimId: string
  report: feedback.SubmitFeedbackRequest
}

/**
 * FDBK-3's report, submitted once (FDBK-4 gives it no update path at all). The
 * slot flips from held to submitted, which changes the mission's breakdown and
 * the project's public feedback list, so both are invalidated.
 */
export function useSubmitFeedback(missionId: string, projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ claimId, report }: SubmitInput): Promise<feedback.Feedback> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/claims/{claimId}/feedback', {
        params: { path: { claimId } },
        body: report,
      })

      return expectBody<feedback.Feedback>(data)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myClaimQueryKey(missionId) })
      void queryClient.invalidateQueries({ queryKey: missionQueryKey(missionId) })
      void queryClient.invalidateQueries({ queryKey: projectMissionsQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: projectFeedbackQueryKey(projectId) })
    },
  })
}
