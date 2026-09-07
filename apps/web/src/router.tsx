import { dehydrate, hydrate } from '@tanstack/react-query'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from '../app/route-tree.gen'
import { createQueryClient } from './shared/query'

/**
 * Called once per SSR request, so the QueryClient it builds is per-request and
 * no cache can cross requests. The dehydrate/hydrate pair carries the prefetched
 * state to the browser, which then mounts without refetching.
 */
export function getRouter() {
  const queryClient = createQueryClient()

  return createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: 'intent',
    // handed over as a JSON string on purpose: the router proves its payload is
    // serializable structurally, and Query types both keys and data as `unknown`,
    // which no structural check can accept even though dehydrate produces JSON
    dehydrate: () => ({ queryState: JSON.stringify(dehydrate(queryClient)) }),
    hydrate: (dehydrated: { queryState: string }) => {
      hydrate(queryClient, JSON.parse(dehydrated.queryState) as ReturnType<typeof dehydrate>)
    },
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
