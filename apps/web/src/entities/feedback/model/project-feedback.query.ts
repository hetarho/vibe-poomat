import type { feedback } from '@repo/contracts'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { apiClient, asBody } from '../../../shared/api'

const EMPTY_PAGE: feedback.FeedbackPage = { items: [], nextCursor: null }

/** How many reports a project page shows before asking for more. */
export const PROJECT_FEEDBACK_PAGE_SIZE = 10

export function projectFeedbackQueryKey(projectId: string) {
  return ['feedback', 'project', projectId] as const
}

/**
 * FDBK-9: everything a project has received, public, newest first, across every
 * mission it has ever run — not just the open one, which is all the project
 * response carries (PROJ-5).
 */
export function projectFeedbackQueryOptions(projectId: string, headers?: Record<string, string>) {
  return infiniteQueryOptions({
    queryKey: projectFeedbackQueryKey(projectId),
    queryFn: async ({ pageParam }): Promise<feedback.FeedbackPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/projects/{projectId}/feedbacks', {
        params: {
          path: { projectId },
          query: {
            limit: String(PROJECT_FEEDBACK_PAGE_SIZE),
            ...(pageParam === null ? {} : { cursor: pageParam }),
          },
        },
      })

      return asBody<feedback.FeedbackPage>(data, EMPTY_PAGE)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function feedbackItemsOf(
  data: { pages: feedback.FeedbackPage[] } | undefined,
): feedback.Feedback[] {
  return data === undefined ? [] : data.pages.flatMap((page) => page.items)
}
