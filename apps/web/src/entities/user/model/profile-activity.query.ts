import type { feedback, projects } from '@repo/contracts'
import { queryOptions } from '@tanstack/react-query'
import { apiClient, asBody } from '../../../shared/api'

/** How much of each list a profile shows before asking for more. */
export const PROFILE_LIST_SIZE = 6

/** The prefix every owner's project list shares, so one write invalidates all. */
export const OWNED_PROJECTS_QUERY_ROOT = ['user', 'projects'] as const

export function ownedProjectsQueryKey(userId: string) {
  return [...OWNED_PROJECTS_QUERY_ROOT, userId] as const
}

export function givenFeedbackQueryKey(userId: string) {
  return ['user', 'feedback-given', userId] as const
}

/** The same feed the front page reads, narrowed to one owner (AUTH-3). */
export function ownedProjectsQueryOptions(userId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: ownedProjectsQueryKey(userId),
    queryFn: async (): Promise<projects.FeedPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/projects', {
        params: { query: { owner: userId, limit: String(PROFILE_LIST_SIZE) } },
      })

      return asBody<projects.FeedPage>(data, { items: [], nextCursor: null })
    },
  })
}

/** What this account has given, which FDBK-9 keeps public. */
export function givenFeedbackQueryOptions(userId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: givenFeedbackQueryKey(userId),
    queryFn: async (): Promise<feedback.FeedbackPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/users/{authorId}/feedbacks', {
        params: { path: { authorId: userId }, query: { limit: String(PROFILE_LIST_SIZE) } },
      })

      return asBody<feedback.FeedbackPage>(data, { items: [], nextCursor: null })
    },
  })
}
