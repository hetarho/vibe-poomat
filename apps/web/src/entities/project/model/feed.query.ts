import type { projects } from '@repo/contracts'
import { infiniteQueryOptions } from '@tanstack/react-query'
import { apiClient, asBody } from '../../../shared/api'
import { FEED_QUERY_ROOT } from './project.query'

const EMPTY_PAGE: projects.FeedPage = { items: [], nextCursor: null }

export type FeedParams = {
  /** PROJ-9 by default, PROJ-10 on the popular tab. */
  sort: projects.FeedSort
  /** PROJ-3's filter, or null for everything. */
  tag: projects.ProjectTag | null
}

export function feedQueryKey(params: FeedParams) {
  return [...FEED_QUERY_ROOT, params.sort, params.tag ?? 'all'] as const
}

/**
 * The cursor is opaque by decision (T024): it is passed back exactly as it
 * arrived and never parsed here, so a change to the ordering cannot break a
 * client that came to depend on what the cursor happened to contain.
 */
export function feedQueryOptions(params: FeedParams, headers?: Record<string, string>) {
  return infiniteQueryOptions({
    queryKey: feedQueryKey(params),
    queryFn: async ({ pageParam }): Promise<projects.FeedPage> => {
      const client = await apiClient(headers)
      const { data } = await client.GET('/api/v1/projects', {
        params: {
          query: {
            sort: params.sort,
            ...(params.tag === null ? {} : { tag: params.tag }),
            ...(pageParam === null ? {} : { cursor: pageParam }),
          },
        },
      })

      return asBody<projects.FeedPage>(data, EMPTY_PAGE)
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  })
}

/** Every page flattened, which is what a list renders. */
export function feedCardsOf(data: { pages: projects.FeedPage[] } | undefined): projects.FeedCard[] {
  return data === undefined ? [] : data.pages.flatMap((page) => page.items)
}
