import { QueryClientProvider } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import type { ReactNode } from 'react'
import appCss from '../../src/app/styles.css?url'
import { sessionQueryOptions } from '../../src/entities/session'
import { forwardedHeaders } from '../../src/shared/api'
import type { RouterContext } from '../../src/shared/query'
import { AppShell, PRODUCT_NAME } from '../../src/widgets/app-shell'
import { HeaderAuth } from '../../src/widgets/header-auth'

export const Route = createRootRouteWithContext<RouterContext>()({
  /**
   * Every page reads the session, so it is resolved once here and before the
   * first render — which is what stops the header flashing the signed-out state
   * at somebody who is signed in. During SSR the incoming cookie has to be
   * forwarded by hand, because the server has no browser to attach it.
   *
   * Prefetched rather than ensured, because this runs on the root route: an
   * `ensureQueryData` rethrows, and an api that is briefly unreachable would
   * then blank every page on the site — including the public ones, which need
   * no session at all. A failure here leaves the header signed-out and the page
   * intact, and the query retries on its own.
   */
  beforeLoad: async ({ context }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    await context.queryClient.prefetchQuery(sessionQueryOptions(headers))
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: PRODUCT_NAME },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
})

function RootLayout() {
  const { queryClient } = Route.useRouteContext()

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell authSlot={<HeaderAuth />}>
        <Outlet />
      </AppShell>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
