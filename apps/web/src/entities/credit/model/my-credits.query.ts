import type { credits } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiClient, expectBody } from '../../../shared/api'

export const MY_CREDITS_QUERY_KEY = ['credits', 'me'] as const

/**
 * CRED-7's owner-only view. The public counters also ride on the session, but
 * this is the one that carries `escrowed` and the one that can be invalidated
 * the moment something moves credits — a balance printed next to a cost has to
 * be the balance that cost will be taken from.
 */
export function myCreditsQueryOptions(headers?: Record<string, string>) {
  return queryOptions({
    queryKey: MY_CREDITS_QUERY_KEY,
    queryFn: async (): Promise<credits.MyCredits> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/credits/me')

      return expectBody<credits.MyCredits>(data)
    },
  })
}
