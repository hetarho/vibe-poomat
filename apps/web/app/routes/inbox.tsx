import { useInfiniteQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { feedbackItemsOf, receivedFeedbackQueryOptions } from '../../src/entities/feedback'
import { requireSession } from '../../src/features/auth'
import { MakerInboxPage } from '../../src/pages/maker-inbox'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * The maker's own inbox, so signed-in only and guarded before anything renders.
 * FDBK-7's clock is why it exists at all: a report nobody decides on decides
 * itself, and this is where a maker sees which ones are close.
 */
export const Route = createFileRoute('/inbox')({
  beforeLoad: async ({ context, location }) => ({
    profile: await requireSession({ queryClient: context.queryClient, location }),
  }),
  loader: async ({ context }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    await context.queryClient.ensureInfiniteQueryData(receivedFeedbackQueryOptions(headers))
  },
  component: InboxRoute,
})

function InboxRoute() {
  const received = useInfiniteQuery(receivedFeedbackQueryOptions())

  return (
    <MakerInboxPage
      reports={feedbackItemsOf(received.data)}
      hasMore={received.hasNextPage}
      loadingMore={received.isFetchingNextPage}
      onLoadMore={() => void received.fetchNextPage()}
    />
  )
}
