import { ApiError } from '@repo/api-client'

export const QUERY_RETRY_LIMIT = 1

/**
 * A 4xx is the server telling us the request itself is wrong; repeating it
 * cannot change the answer. Everything else gets exactly one more chance.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false

  return failureCount < QUERY_RETRY_LIMIT
}
