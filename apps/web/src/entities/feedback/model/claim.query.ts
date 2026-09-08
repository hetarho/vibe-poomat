import type { feedback } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiClient, expectBody } from '../../../shared/api'

export function myClaimQueryKey(missionId: string) {
  return ['claim', 'mine', missionId] as const
}

/**
 * FDBK-2 gives one account one live claim per mission, so this is either that
 * claim or nothing. Signed-in only — a signed-out reader has nothing to ask
 * about, so the caller keeps the query disabled rather than handling a 401.
 */
export function myClaimQueryOptions(missionId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: myClaimQueryKey(missionId),
    queryFn: async (): Promise<feedback.Claim | null> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/missions/{missionId}/claims/me', {
        params: { path: { missionId } },
      })

      return expectBody<feedback.MyClaim>(data).claim
    },
  })
}
