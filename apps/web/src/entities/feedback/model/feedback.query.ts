import type { feedback } from '@repo/contracts'
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query'
import { ApiError, apiClient, asBody, expectBody } from '../../../shared/api'

export function feedbackQueryKey(feedbackId: string) {
  return ['feedback', feedbackId] as const
}

/** FDBK-9: public, rejection and all. A report nobody can find answers null. */
export function feedbackQueryOptions(feedbackId: string, headers?: Record<string, string>) {
  return queryOptions({
    queryKey: feedbackQueryKey(feedbackId),
    queryFn: async (): Promise<feedback.Feedback | null> => {
      const client = await apiClient(headers)

      try {
        const { data } = await client.GET('/api/v1/feedbacks/{id}', {
          params: { path: { id: feedbackId } },
        })

        return expectBody<feedback.Feedback>(data)
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null

        throw error
      }
    },
  })
}

export function threadQueryKey(feedbackId: string) {
  return ['feedback', feedbackId, 'thread'] as const
}

const EMPTY_THREAD: feedback.ThreadPage = { items: [], nextCursor: null }

/** FDBK-5: everyone reads it, oldest first — a conversation, not a feed. */
export function threadQueryOptions(feedbackId: string, headers?: Record<string, string>) {
  return infiniteQueryOptions({
    queryKey: threadQueryKey(feedbackId),
    queryFn: async ({ pageParam }): Promise<feedback.ThreadPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/feedbacks/{id}/replies', {
        params: {
          path: { id: feedbackId },
          query: pageParam === null ? {} : { cursor: pageParam },
        },
      })

      return asBody<feedback.ThreadPage>(data, EMPTY_THREAD)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

export function repliesOf(
  data: { pages: feedback.ThreadPage[] } | undefined,
): feedback.FeedbackReply[] {
  return data === undefined ? [] : data.pages.flatMap((page) => page.items)
}

export const RECEIVED_FEEDBACK_QUERY_KEY = ['feedback', 'received'] as const

const EMPTY_PAGE: feedback.FeedbackPage = { items: [], nextCursor: null }

/** The maker's inbox: still-undecided reports first, then newest first. */
export function receivedFeedbackQueryOptions(headers?: Record<string, string>) {
  return infiniteQueryOptions({
    queryKey: RECEIVED_FEEDBACK_QUERY_KEY,
    queryFn: async ({ pageParam }): Promise<feedback.FeedbackPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/feedbacks/received', {
        params: { query: pageParam === null ? {} : { cursor: pageParam } },
      })

      return asBody<feedback.FeedbackPage>(data, EMPTY_PAGE)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}
