import type { projects } from '@repo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { OWNED_PROJECTS_QUERY_ROOT } from '../../../entities/user'
import { apiClient, expectBody } from '../../../shared/api'

/**
 * A partial edit: whatever is absent is left alone, and an explicit null clears
 * a field. The answer is the whole project, so the cache is set from it rather
 * than invalidated — the page shows what was actually saved, not what was typed.
 */
export function useEditProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (changes: projects.UpdateProjectRequest): Promise<projects.Project> => {
      const client = await apiClient()
      const { data } = await client.PATCH('/api/v1/projects/{id}', {
        params: { path: { id: projectId } },
        body: changes,
      })

      return expectBody<projects.Project>(data)
    },
    onSuccess: (project) => {
      queryClient.setQueryData(projectQueryKey(project.id), project)
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
      void queryClient.invalidateQueries({ queryKey: OWNED_PROJECTS_QUERY_ROOT })
    },
  })
}
