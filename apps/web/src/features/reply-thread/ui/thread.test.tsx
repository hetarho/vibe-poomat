import type { feedback } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { threadQueryKey } from '../../../entities/feedback'
import { EMPTY_THREAD, READ_ONLY_NOTICE, REPLY_LABEL, Thread } from './thread'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const FEEDBACK_ID = '0192f000-0000-7000-8000-0000000000f1'

const MAKER = {
  id: '0192f000-0000-7000-8000-0000000000aa',
  handle: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
}

const EXISTING: feedback.FeedbackReply = {
  id: '0192f000-0000-7000-8000-0000000000e1',
  feedbackId: FEEDBACK_ID,
  author: MAKER,
  body: 'Thanks — the export is next.',
  createdAt: '2026-09-08T13:00:00.000Z',
}

type ThreadPages = { pages: feedback.ThreadPage[]; pageParams: unknown[] }

function renderThread(
  options: {
    participant?: feedback.FeedbackReply['author'] | null
    replies?: feedback.FeedbackReply[]
  } = {},
): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const replies = options.replies ?? [EXISTING]
  client.setQueryData<ThreadPages>(threadQueryKey(FEEDBACK_ID), {
    pages: [{ items: replies, nextCursor: null }],
    pageParams: [null],
  })

  render(
    <QueryClientProvider client={client}>
      <Thread
        feedbackId={FEEDBACK_ID}
        replies={replies}
        participant={options.participant === undefined ? MAKER : options.participant}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
    </QueryClientProvider>,
  )

  return client
}

function cachedBodies(client: QueryClient): string[] {
  const data = client.getQueryData<ThreadPages>(threadQueryKey(FEEDBACK_ID))

  return data?.pages.flatMap((page) => page.items.map((item) => item.body)) ?? []
}

function replyBox(): HTMLElement {
  return screen.getByLabelText(REPLY_LABEL)
}

describe('Thread (FDBK-5)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({
      data: { ...EXISTING, id: 'server-1', body: 'On its way.', author: MAKER },
    })
  })

  describe('who may write', () => {
    it('offers the box to a participant', () => {
      renderThread({ participant: MAKER })

      expect(replyBox()).toBeInTheDocument()
    })

    it('offers no box at all to anybody else, and says why', () => {
      renderThread({ participant: null })

      expect(screen.queryByLabelText(REPLY_LABEL)).toBeNull()
      expect(screen.getByText(READ_ONLY_NOTICE)).toBeInTheDocument()
    })

    it('still shows everybody the replies', () => {
      renderThread({ participant: null })

      expect(screen.getByText(EXISTING.body)).toBeInTheDocument()
    })
  })

  describe('what it renders', () => {
    it('says so when nothing has been said', () => {
      renderThread({ replies: [] })

      expect(screen.getByText(EMPTY_THREAD)).toBeInTheDocument()
    })

    it('keeps a reply from a gone account readable as a deleted user (AUTH-9)', () => {
      renderThread({ replies: [{ ...EXISTING, author: null }] })

      expect(screen.getByText('deleted user')).toBeInTheDocument()
    })
  })

  describe('posting one', () => {
    it('shows it before the server has answered', async () => {
      let settle: (value: unknown) => void = () => undefined
      post.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve
        }),
      )
      const client = renderThread()

      await userEvent.type(replyBox(), 'On its way.')
      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))

      await waitFor(() => {
        expect(cachedBodies(client)).toContain('On its way.')
      })
      settle({ data: { ...EXISTING, id: 'server-1', body: 'On its way.' } })
    })

    it('keeps exactly one copy once the server answers', async () => {
      const client = renderThread()
      await userEvent.type(replyBox(), 'On its way.')

      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))

      await waitFor(() => {
        expect(cachedBodies(client).filter((body) => body === 'On its way.')).toHaveLength(1)
      })
    })

    it('takes it back out when the post fails', async () => {
      post.mockRejectedValue(new Error('offline'))
      const client = renderThread()
      await userEvent.type(replyBox(), 'On its way.')

      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
      expect(cachedBodies(client)).toEqual([EXISTING.body])
    })

    it('sends the trimmed body, once', async () => {
      renderThread()
      await userEvent.type(replyBox(), '   On its way.   ')

      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/feedbacks/{id}/replies', {
          params: { path: { id: FEEDBACK_ID } },
          body: { body: 'On its way.' },
        })
      })
    })

    it('sends nothing for an empty box', async () => {
      renderThread()

      expect(screen.getByRole('button', { name: REPLY_LABEL })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))
      expect(post).not.toHaveBeenCalled()
    })

    it('empties the box once it has gone', async () => {
      renderThread()
      await userEvent.type(replyBox(), 'On its way.')

      await userEvent.click(screen.getByRole('button', { name: REPLY_LABEL }))

      await waitFor(() => {
        expect(replyBox()).toHaveValue('')
      })
    })
  })
})
