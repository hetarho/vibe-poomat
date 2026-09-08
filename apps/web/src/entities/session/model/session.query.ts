import type { auth } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient } from '../../../shared/api'

export type CurrentUser = auth.Me

export const SESSION_QUERY_KEY = ['session', 'me'] as const

/**
 * Who is signed in, or null. Signed out is an answer rather than a failure, so a
 * 401 resolves instead of throwing — every consumer would otherwise have to
 * distinguish "not signed in" from "the api is down".
 */
export async function fetchCurrentUser(
  headers?: Record<string, string>,
): Promise<CurrentUser | null> {
  const client = await apiClient(headers)

  try {
    const { data } = await client.GET('/api/v1/auth/me')

    return (data as CurrentUser | undefined) ?? null
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null

    throw error
  }
}

/**
 * Server state, so it lives in TanStack Query and nowhere else (ARCH-7). The
 * headers are only ever passed during SSR, where the cookie has to be forwarded
 * by hand; in the browser the same-site cookie rides along on its own.
 */
export function sessionQueryOptions(headers?: Record<string, string>) {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => fetchCurrentUser(headers),
    // the session is the one thing every page reads, and it changes only when
    // this tab causes it to, so it is not worth refetching on every focus
    staleTime: 5 * 60_000,
  })
}
