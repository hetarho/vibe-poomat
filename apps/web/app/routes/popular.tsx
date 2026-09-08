import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import {
  type FeedSearch,
  feedQueryOptions,
  feedSearchFor,
  parseFeedSearch,
} from '../../src/entities/project'
import { PopularPage } from '../../src/pages/popular'
import { forwardedHeaders } from '../../src/shared/api'

/** PROJ-10's tab. Same shape as the feed, one word different (the sort). */
export const Route = createFileRoute('/popular')({
  validateSearch: (search: Record<string, unknown>): FeedSearch => parseFeedSearch(search),
  loaderDeps: ({ search }) => ({ tag: search.tag }),
  loader: async ({ context, deps }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    // prefetched rather than ensured: an `ensure` rethrows, and an api that is
    // briefly unreachable would then blank a public page instead of rendering
    // the shell with a feed that retries on its own
    await context.queryClient.prefetchInfiniteQuery(
      feedQueryOptions({ sort: 'popular', tag: deps.tag ?? null }, headers),
    )
  },
  component: PopularRoute,
})

function PopularRoute() {
  const { tag } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <PopularPage
      tag={tag ?? null}
      onTagChange={(next) => void navigate({ search: feedSearchFor(next), replace: true })}
    />
  )
}
