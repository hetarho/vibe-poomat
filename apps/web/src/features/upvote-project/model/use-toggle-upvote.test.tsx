import { ApiError } from '@repo/api-client'
import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { feedQueryKey, projectQueryKey } from '../../../entities/project'
import { UpvoteButton } from '../ui/upvote-button'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const FEED_KEY = feedQueryKey({ sort: 'default', tag: null })

const CARD: projects.FeedCard = {
  id: PROJECT_ID,
  owner: {
    id: '0192f000-0000-7000-8000-0000000000aa',
    handle: 'ada',
    displayName: 'Ada',
    avatarUrl: null,
  },
  title: 'Poomat',
  pitch: 'Feedback for people who ship.',
  tags: ['Tool'],
  coverUrl: null,
  upvoteCount: 3,
  upvotedByViewer: false,
  claimableSlots: 0,
  createdAt: '2026-09-01T00:00:00.000Z',
}

type InfinitePages = { pages: projects.FeedPage[]; pageParams: unknown[] }

function cachedCard(client: QueryClient): projects.FeedCard {
  const data = client.getQueryData<InfinitePages>(FEED_KEY)

  return data?.pages[0]?.items[0] as projects.FeedCard
}

function Harness({ client, children }: { client: QueryClient; children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderButton(card: projects.FeedCard = CARD): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData<InfinitePages>(FEED_KEY, {
    pages: [{ items: [card], nextCursor: null }],
    pageParams: [null],
  })

  render(
    <Harness client={client}>
      <UpvoteButton projectId={card.id} count={card.upvoteCount} upvoted={card.upvotedByViewer} />
    </Harness>,
  )

  return client
}

function upvote(): HTMLElement {
  return screen.getByRole('button', { name: /Upvote|Remove your upvote/ })
}

describe('useToggleUpvote (PROJ-11)', () => {
  beforeEach(() => {
    post.mockReset()
  })

  it('moves the cached count on the press, before the server has answered', async () => {
    let settle: (value: unknown) => void = () => undefined
    post.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve
      }),
    )
    const client = renderButton()

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(cachedCard(client).upvoteCount).toBe(4)
    })
    expect(cachedCard(client).upvotedByViewer).toBe(true)
    settle({ data: { upvoted: true, upvoteCount: 4 } })
  })

  /** The server is what decides the number, even when this client guessed right. */
  it('takes the server’s count afterwards, not the guess', async () => {
    post.mockResolvedValue({ data: { upvoted: true, upvoteCount: 9 } })
    const client = renderButton()

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(cachedCard(client).upvoteCount).toBe(9)
    })
  })

  it('rolls the count back when the mutation fails', async () => {
    post.mockRejectedValue(new ApiError(409, { code: 'CONFLICT', message: 'no' }))
    const client = renderButton()

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(cachedCard(client).upvoteCount).toBe(3)
    })
    expect(cachedCard(client).upvotedByViewer).toBe(false)
  })

  it('takes an upvote back the same way, downwards', async () => {
    post.mockResolvedValue({ data: { upvoted: false, upvoteCount: 2 } })
    const client = renderButton({ ...CARD, upvotedByViewer: true })

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(cachedCard(client).upvoteCount).toBe(2)
    })
    expect(cachedCard(client).upvotedByViewer).toBe(false)
  })

  /** The detail page reads the project, not a card; both have to move. */
  it('moves the cached project as well as the feed', async () => {
    post.mockResolvedValue({ data: { upvoted: true, upvoteCount: 4 } })
    const client = renderButton()
    client.setQueryData(projectQueryKey(PROJECT_ID), {
      id: PROJECT_ID,
      upvoteCount: 3,
      upvotedByViewer: false,
    })

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(client.getQueryData(projectQueryKey(PROJECT_ID))).toMatchObject({
        upvoteCount: 4,
        upvotedByViewer: true,
      })
    })
  })

  it('calls the endpoint once per press', async () => {
    post.mockResolvedValue({ data: { upvoted: true, upvoteCount: 4 } })
    renderButton()

    await userEvent.click(upvote())

    await waitFor(() => {
      expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/{id}/upvote', {
        params: { path: { id: PROJECT_ID } },
      })
    })
  })
})
