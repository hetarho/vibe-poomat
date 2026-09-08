import type { auth } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient, asBody } from '../../../shared/api'

export type PublicProfile = auth.PublicProfile

export function profileQueryKey(handle: string) {
  return ['user', 'profile', handle] as const
}

/**
 * AUTH-6's `/@handle` lookup. A handle nobody holds resolves to null rather than
 * throwing, so the page renders its own not-found instead of an error boundary.
 */
export async function fetchProfile(
  handle: string,
  headers?: Record<string, string>,
): Promise<PublicProfile | null> {
  const client = await apiClient(headers)

  try {
    const { data } = await client.GET('/api/v1/users/by-handle/{handle}', {
      params: { path: { handle } },
    })

    return asBody<PublicProfile | null>(data, null)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}

export function profileQueryOptions(handle: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: profileQueryKey(handle),
    queryFn: () => fetchProfile(handle, headers),
  })
}
