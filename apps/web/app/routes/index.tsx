import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import {
  type FeedSearch,
  feedQueryOptions,
  feedSearchFor,
  parseFeedSearch,
} from '../../src/entities/project'
import { FeedPage } from '../../src/pages/feed'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * PROJ-9's feed, and the landing page. The filter lives in the URL so a filtered
 * feed is a link somebody can send, and the loader honours it on a cold load —
 * the first paint is the filtered list, not the unfiltered one replaced.
 */
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): FeedSearch => parseFeedSearch(search),
  loaderDeps: ({ search }) => ({ tag: search.tag }),
  loader: async ({ context, deps }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    // prefetched rather than ensured: an `ensure` rethrows, and an api that is
    // briefly unreachable would then blank a public page instead of rendering
    // the shell with a feed that retries on its own
    await context.queryClient.prefetchInfiniteQuery(
      feedQueryOptions({ sort: 'default', tag: deps.tag ?? null }, headers),
    )
  },
  component: FeedRoute,
})

function FeedRoute() {
  const { tag } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <FeedPage
      tag={tag ?? null}
      onTagChange={(next) => void navigate({ search: feedSearchFor(next), replace: true })}
    />
  )
}
