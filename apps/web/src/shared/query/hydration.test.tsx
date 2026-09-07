import type { QueryClient } from '@tanstack/react-query'
import { dehydrate, hydrate, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './query-client'

const GREETING_KEY = ['greeting', 'current'] as const

function Greeting({ queryFn }: { queryFn: () => Promise<string> }) {
  const { data } = useQuery({ queryKey: GREETING_KEY, queryFn })

  return <p>{data ?? 'nothing yet'}</p>
}

function inProvider(client: QueryClient, element: ReactElement): ReactElement {
  return <QueryClientProvider client={client}>{element}</QueryClientProvider>
}

/** What one SSR request does: a fresh client, a prefetch, then one render. */
async function renderOnServer(value: string) {
  const queryFn = vi.fn(async () => value)
  const client = createQueryClient()
  await client.prefetchQuery({ queryKey: GREETING_KEY, queryFn })
  const html = renderToString(inProvider(client, <Greeting queryFn={queryFn} />))

  return { client, html, queryFn }
}

describe('SSR hydration', () => {
  it('renders prefetched data on the server', async () => {
    const { html, queryFn } = await renderOnServer('hello from the server')

    expect(html).toContain('hello from the server')
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('mounts on the client without fetching again', async () => {
    const { client: serverClient } = await renderOnServer('hello from the server')

    const clientSideFetch = vi.fn(async () => 'a second trip to the api')
    const browserClient = createQueryClient()
    hydrate(browserClient, dehydrate(serverClient))

    render(inProvider(browserClient, <Greeting queryFn={clientSideFetch} />))

    expect(await screen.findByText('hello from the server')).toBeInTheDocument()
    expect(clientSideFetch).not.toHaveBeenCalled()
  })

  it('leaks nothing between two sequential requests', async () => {
    const first = await renderOnServer('data for request one')
    const second = await renderOnServer('data for request two')

    expect(first.html).toContain('data for request one')
    expect(second.html).toContain('data for request two')
    expect(second.html).not.toContain('data for request one')

    expect(first.client.getQueryData(GREETING_KEY)).toBe('data for request one')
    expect(second.client.getQueryData(GREETING_KEY)).toBe('data for request two')
    expect(first.client).not.toBe(second.client)
  })

  it('hydrates each request into its own browser client', async () => {
    const first = await renderOnServer('data for request one')
    const second = await renderOnServer('data for request two')

    const browserForSecond = createQueryClient()
    hydrate(browserForSecond, dehydrate(second.client))

    expect(browserForSecond.getQueryData(GREETING_KEY)).toBe('data for request two')
  })
})
