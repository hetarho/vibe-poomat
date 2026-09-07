import type { QueryClient } from '@tanstack/react-query'

/** What every route can reach through its context. */
export type RouterContext = {
  queryClient: QueryClient
}
