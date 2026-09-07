import { QueryClient } from '@tanstack/react-query'
import { QUERY_RETRY_LIMIT, shouldRetryQuery } from './retry'

export const DEFAULT_STALE_TIME_MS = 30_000

/**
 * Created per SSR request, never at module level, so no cache ever crosses
 * requests. TanStack Query is the only cache layer in the web app (ARCH-33).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        retry: shouldRetryQuery,
      },
      mutations: {
        // a retried mutation can double a side effect, so it never retries
        retry: false,
      },
    },
  })
}

export { QUERY_RETRY_LIMIT }
