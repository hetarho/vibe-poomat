import type { projects } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiClient, asBody } from '../../../shared/api'

export function projectMissionsQueryKey(projectId: string) {
  return ['mission', 'project', projectId] as const
}

/**
 * Every mission a project has run, newest first. A project only ever carries the
 * mission that is still open (PROJ-5), so this is the only way to name the one
 * that closed or expired — which is exactly what the maker's panel has to show
 * (PROJ-6), and where the frozen task text lives (PROJ-7).
 */
export function projectMissionsQueryOptions(projectId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: projectMissionsQueryKey(projectId),
    queryFn: async (): Promise<projects.Mission[]> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/projects/{projectId}/missions', {
        params: { path: { projectId } },
      })

      return asBody<projects.Mission[]>(data, [])
    },
  })
}

/** The one the panel shows: the newest, open or long over. */
export function latestMission(missions: projects.Mission[] | undefined): projects.Mission | null {
  return missions?.[0] ?? null
}

export function openMissionOf(missions: projects.Mission[] | undefined): projects.Mission | null {
  return missions?.find((mission) => mission.state === 'open') ?? null
}
