import type { feedback } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { MY_CREDITS_QUERY_KEY } from '../../../entities/credit'
import {
  feedbackQueryKey,
  projectFeedbackQueryKey,
  RECEIVED_FEEDBACK_QUERY_KEY,
} from '../../../entities/feedback'
import { missionQueryKey, projectMissionsQueryKey } from '../../../entities/mission'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { apiClient, expectBody } from '../../../shared/api'

export type SettleDecision =
  | { kind: 'accept' }
  | { kind: 'reject'; reason: feedback.RejectionReason; note: string | null }

/**
 * FDBK-6 with CRED-4's movement, which the server does in one transaction. A
 * settle moves a credit, so the balance goes with it: a stale balance after a
 * settle is the most visible cache bug this app can have, which is why the
 * credit read and the session's public counters are invalidated here too.
 */
export function useSettleFeedback(report: feedback.Feedback) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (decision: SettleDecision): Promise<feedback.Feedback> => {
      const client = await apiClient()

      if (decision.kind === 'accept') {
        const { data } = await client.POST('/api/v1/feedbacks/{id}/accept', {
          params: { path: { id: report.id } },
        })

        return expectBody<feedback.Feedback>(data)
      }

      const { data } = await client.POST('/api/v1/feedbacks/{id}/reject', {
        params: { path: { id: report.id } },
        body: { reason: decision.reason, note: decision.note },
      })

      return expectBody<feedback.Feedback>(data)
    },
    onSuccess: (settled) => {
      // the answer is the whole report, so the page shows what was decided
      queryClient.setQueryData(feedbackQueryKey(settled.id), settled)
      void queryClient.invalidateQueries({ queryKey: RECEIVED_FEEDBACK_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: projectFeedbackQueryKey(settled.projectId) })
      void queryClient.invalidateQueries({ queryKey: missionQueryKey(settled.missionId) })
      void queryClient.invalidateQueries({
        queryKey: projectMissionsQueryKey(settled.projectId),
      })
      void queryClient.invalidateQueries({ queryKey: MY_CREDITS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    },
    onError: () => {
      // somebody else may have settled it first (or the clock did): whatever the
      // truth is now, it is worth re-reading rather than retrying blind
      void queryClient.invalidateQueries({ queryKey: feedbackQueryKey(report.id) })
    },
  })
}
