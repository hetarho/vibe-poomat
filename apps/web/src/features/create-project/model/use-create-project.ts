import type { projects } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { OWNED_PROJECTS_QUERY_ROOT } from '../../../entities/user'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * PROJ-2 makes this a slow request on purpose: the server opens the live URL
 * before the row exists, so an unusable project never does. The pending state
 * is therefore part of the contract, not a nicety.
 *
 * PROJ-12: what comes back is already public, so it is seeded into the cache
 * under its own key and the project page it redirects to needs no second fetch.
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: projects.CreateProjectRequest): Promise<projects.Project> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/projects', { body: request })

      return expectBody<projects.Project>(data)
    },
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKey(project.id), project)
      // the feed now has a row it did not have, on every tab and filter
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
      void queryClient.invalidateQueries({ queryKey: OWNED_PROJECTS_QUERY_ROOT })
    },
  })
}
