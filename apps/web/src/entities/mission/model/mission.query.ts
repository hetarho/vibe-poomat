import type { projects } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient, asBody, expectBody } from '../../../shared/api'

export function missionQueryKey(missionId: string) {
  return ['mission', missionId] as const
}

/**
 * One mission. The report form is reached as `/missions/:id/report` and knows
 * nothing but that id, so it cannot go through the project's list to find the
 * task it is asking somebody to do.
 */
export function missionQueryOptions(missionId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: missionQueryKey(missionId),
    queryFn: async (): Promise<projects.Mission | null> => {
      const client = await apiClient(headers)

      try {
        const { data } = await client.GET('/api/v1/missions/{id}', {
          params: { path: { id: missionId } },
        })

        return expectBody<projects.Mission>(data)
      } catch (error) {
        // a mission nobody can see is an answer, so the page renders not-found
        if (error instanceof ApiError && error.status === 404) return null

        throw error
      }
    },
  })
}

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
