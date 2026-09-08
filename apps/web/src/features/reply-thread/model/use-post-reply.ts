import type { feedback } from '@repo/contracts'
import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { threadQueryKey } from '../../../entities/feedback'
import { apiClient, expectBody } from '../../../shared/api'

type ThreadPages = { pages: feedback.ThreadPage[]; pageParams: unknown[] }

/** Marks a reply that is on screen but not yet acknowledged by the server. */
export const PENDING_REPLY_PREFIX = 'pending:'

function appendToLastPage(
  data: ThreadPages | undefined,
  reply: feedback.FeedbackReply,
): ThreadPages | undefined {
  if (data === undefined) return data

  // oldest first, so a new reply belongs at the end of the last page
  const pages = data.pages.map((page, index) =>
    index === data.pages.length - 1 ? { ...page, items: [...page.items, reply] } : page,
  )

  return { ...data, pages }
}

function dropReply(client: QueryClient, feedbackId: string, replyId: string): void {
  client.setQueryData<ThreadPages>(threadQueryKey(feedbackId), (data) =>
    data === undefined
      ? data
      : {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.id !== replyId),
          })),
        },
  )
}

/**
 * FDBK-5's reply, shown before the server has confirmed it: a message that
 * appears only after a round trip reads as a message that failed to send. The
 * optimistic row carries a marked id so it can be taken out again, and the
 * server's own row replaces it on success.
 */
export function usePostReply(feedbackId: string, author: feedback.FeedbackReply['author']) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (body: string): Promise<feedback.FeedbackReply> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/feedbacks/{id}/replies', {
        params: { path: { id: feedbackId } },
        body: { body },
      })

      return expectBody<feedback.FeedbackReply>(data)
    },
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: threadQueryKey(feedbackId) })

      const optimisticId = `${PENDING_REPLY_PREFIX}${Date.now()}`
      queryClient.setQueryData<ThreadPages>(threadQueryKey(feedbackId), (data) =>
        appendToLastPage(data, {
          id: optimisticId,
          feedbackId,
          author,
          body,
          createdAt: new Date().toISOString(),
        }),
      )

      return { optimisticId }
    },
    onError: (_error, _body, context) => {
      if (context !== undefined) dropReply(queryClient, feedbackId, context.optimisticId)
    },
    onSuccess: (reply, _body, context) => {
      if (context !== undefined) dropReply(queryClient, feedbackId, context.optimisticId)
      queryClient.setQueryData<ThreadPages>(threadQueryKey(feedbackId), (data) =>
        appendToLastPage(data, reply),
      )
    },
  })
}
