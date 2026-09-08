import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { OWNED_PROJECTS_QUERY_ROOT } from '../../../entities/user'
import { apiClient } from '../../../shared/api'

/**
 * PROJ-8: hidden rather than removed. The cached project is dropped instead of
 * refetched, because what the owner may still see of it is a different view
 * from the one this page was showing.
 */
export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<void> => {
      const client = await apiClient()
      await client.DELETE('/api/v1/projects/{id}', { params: { path: { id: projectId } } })
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: projectQueryKey(projectId) })
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_ROOT })
      void queryClient.invalidateQueries({ queryKey: OWNED_PROJECTS_QUERY_ROOT })
    },
  })
}
