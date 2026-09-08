import type { projects } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient, expectBody } from '../../../shared/api'

/**
 * Every feed query hangs off this, so anything that changes what the feed holds
 * can invalidate all of them without knowing how a tab or a filter is keyed.
 */
export const FEED_QUERY_ROOT = ['feed'] as const

export function projectQueryKey(id: string) {
  return ['project', id] as const
}

/**
 * A project nobody can see is an answer rather than a failure, so a 404 resolves
 * to null — the page then renders its own not-found instead of an error boundary.
 * PROJ-8 is why a viewer and its owner can get different answers for one id.
 */
export async function fetchProject(
  id: string,
  headers?: Record<string, string>,
): Promise<projects.Project | null> {
  const client = await apiClient(headers)

  try {
    const { data } = await client.GET('/api/v1/projects/{id}', { params: { path: { id } } })

    return expectBody<projects.Project>(data)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}

export function projectQueryOptions(id: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: projectQueryKey(id),
    queryFn: () => fetchProject(id, headers),
  })
}
