import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROJECT_TAGS } from '../../../entities/project'
import { ALL_TAGS_LABEL, LOAD_MORE_LABEL, ProjectFeed, TAG_FILTER_LABEL } from './project-feed'

const get = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ GET: get }) }
})

const EMPTY = 'Nothing here yet.'

function card(id: string, title: string): projects.FeedCard {
  return {
    id,
    owner: {
      id: '0192f000-0000-7000-8000-0000000000aa',
      handle: 'ada',
      displayName: 'Ada',
      avatarUrl: null,
    },
    title,
    pitch: 'A pitch.',
    tags: ['Tool'],
    coverUrl: null,
    upvoteCount: 0,
    upvotedByViewer: false,
    claimableSlots: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
  }
}

function renderFeed(
  tag: projects.ProjectTag | null = null,
  onTagChange = vi.fn(),
): typeof onTagChange {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <ProjectFeed
        sort="default"
        tag={tag}
        onTagChange={onTagChange}
        emptyMessage={EMPTY}
        renderCard={(item) => <span>{item.title}</span>}
      />
    </QueryClientProvider>,
  )

  return onTagChange
}

describe('ProjectFeed (PROJ-9, PROJ-3)', () => {
  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: { items: [card('a', 'Poomat')], nextCursor: null } })
  })

  describe('the tag chips', () => {
    it('offers exactly the fixed list plus a way off it', async () => {
      renderFeed()

      const group = screen.getByRole('group', { name: TAG_FILTER_LABEL })
      for (const tag of PROJECT_TAGS) {
        expect(group).toHaveTextContent(tag)
      }
      expect(group).toHaveTextContent(ALL_TAGS_LABEL)
    })

    /** "Back on reload": the URL's tag is what decides which chip is on. */
    it('shows the tag it was given as the one that is on', () => {
      renderFeed('Game')

      expect(screen.getByRole('button', { name: 'Game' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: ALL_TAGS_LABEL })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })

    it('reports a chosen tag, for the route to put in the URL', async () => {
      const onTagChange = renderFeed()

      await userEvent.click(screen.getByRole('button', { name: 'AI' }))

      expect(onTagChange).toHaveBeenCalledExactlyOnceWith('AI')
    })

    it('reports null when the tag that is on is pressed again', async () => {
      const onTagChange = renderFeed('AI')

      await userEvent.click(screen.getByRole('button', { name: 'AI' }))

      expect(onTagChange).toHaveBeenCalledExactlyOnceWith(null)
    })

    it('asks the api for the tag it was given', async () => {
      renderFeed('Social')

      await waitFor(() => {
        expect(get).toHaveBeenCalledWith('/api/v1/projects', {
          params: { query: { sort: 'default', tag: 'Social' } },
        })
      })
    })
  })

  describe('what it renders', () => {
    it('draws every card through the card it was handed', async () => {
      renderFeed()

      expect(await screen.findByText('Poomat')).toBeInTheDocument()
    })

    it('says so when there is nothing, rather than showing an empty list', async () => {
      get.mockResolvedValue({ data: { items: [], nextCursor: null } })
      renderFeed()

      expect(await screen.findByText(EMPTY)).toBeInTheDocument()
      expect(screen.queryByRole('list')).toBeNull()
    })
  })

  describe('paging on the cursor', () => {
    it('offers nothing more when the page is the last one', async () => {
      renderFeed()

      await screen.findByText('Poomat')
      expect(screen.queryByRole('button', { name: LOAD_MORE_LABEL })).toBeNull()
    })

    it('asks for the next page with the cursor it was given, and appends it', async () => {
      get.mockResolvedValueOnce({ data: { items: [card('a', 'First')], nextCursor: 'c-1' } })
      get.mockResolvedValueOnce({ data: { items: [card('b', 'Second')], nextCursor: null } })
      renderFeed()

      await userEvent.click(await screen.findByRole('button', { name: LOAD_MORE_LABEL }))

      expect(await screen.findByText('Second')).toBeInTheDocument()
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(get).toHaveBeenLastCalledWith('/api/v1/projects', {
        params: { query: { sort: 'default', cursor: 'c-1' } },
      })
    })
  })
})
