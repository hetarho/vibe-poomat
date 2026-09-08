import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedQueryKey } from '../../../entities/project'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { ProjectCard } from './project-card'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const OWNER = {
  id: '0192f000-0000-7000-8000-0000000000aa',
  handle: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
}

const CARD: projects.FeedCard = {
  id: '0192f000-0000-7000-8000-000000000001',
  owner: OWNER,
  title: 'Poomat',
  pitch: 'Feedback for people who ship.',
  tags: ['Tool'],
  coverUrl: null,
  upvoteCount: 3,
  upvotedByViewer: false,
  claimableSlots: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
}

const VIEWER = { id: '0192f000-0000-7000-8000-0000000000bb', handle: 'bob' }

/** The card renders Links, so it needs a router; one route is enough. */
function renderCard(
  card: projects.FeedCard = CARD,
  viewer: { id: string; handle: string } | null = VIEWER,
): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, viewer)
  client.setQueryData(feedQueryKey({ sort: 'default', tag: null }), {
    pages: [{ items: [card], nextCursor: null }],
    pageParams: [null],
  })

  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ProjectCard card={card} />,
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(
    <QueryClientProvider client={client}>
      {/* the test router is not the app's; the card only needs `to` to resolve */}
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )

  return client
}

/** The router mounts asynchronously, so every lookup here has to wait for it. */
function upvote(): Promise<HTMLElement> {
  return screen.findByRole('button', { name: /Upvote|Remove your upvote/ })
}

describe('ProjectCard (PROJ-9, PROJ-11)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { upvoted: true, upvoteCount: 4 } })
  })

  describe('the claimable-slot badge (PROJ-9)', () => {
    it('is absent when no slot can be taken', async () => {
      renderCard()

      expect(await screen.findByText('Poomat')).toBeInTheDocument()
      expect(screen.queryByText(/slots? open/)).toBeNull()
    })

    it('says how many when there are some', async () => {
      renderCard({ ...CARD, claimableSlots: 2 })

      expect(await screen.findByText('2 slots open')).toBeInTheDocument()
    })

    it('says it in the singular for exactly one', async () => {
      renderCard({ ...CARD, claimableSlots: 1 })

      expect(await screen.findByText('1 slot open')).toBeInTheDocument()
    })
  })

  describe('the upvote control (PROJ-11)', () => {
    it('is hidden on your own project, not merely disabled', async () => {
      renderCard(CARD, { id: OWNER.id, handle: OWNER.handle })

      expect(await screen.findByText('Poomat')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Upvote/ })).toBeNull()
    })

    it('is offered to somebody else, showing the count', async () => {
      renderCard()

      expect(await upvote()).toHaveTextContent('3')
      expect(await upvote()).toHaveAttribute('aria-pressed', 'false')
    })

    it('shows an existing vote as pressed', async () => {
      renderCard({ ...CARD, upvotedByViewer: true })

      expect(await upvote()).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('a signed-out reader', () => {
    it('is asked to sign in rather than told nothing happened', async () => {
      renderCard(CARD, null)

      await userEvent.click(await upvote())

      expect(await screen.findByRole('dialog')).toHaveTextContent('Sign in')
    })

    it('calls the api not at all', async () => {
      renderCard(CARD, null)

      await userEvent.click(await upvote())

      expect(post).not.toHaveBeenCalled()
    })
  })
})
