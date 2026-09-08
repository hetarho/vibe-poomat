import type { feedback, projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { READ_ONLY_NOTICE, REPLY_LABEL } from '../../../features/reply-thread'
import { ACCEPT_LABEL, REJECT_LABEL } from '../../../features/settle-feedback'
import { FeedbackDetailPage, NOT_FOUND_HEADING } from './feedback-detail-page'

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: vi.fn() }) }
})

const MAKER_ID = '0192f000-0000-7000-8000-0000000000aa'
const AUTHOR_ID = '0192f000-0000-7000-8000-0000000000cc'
const STRANGER_ID = '0192f000-0000-7000-8000-0000000000ee'

const REPORT = {
  id: '0192f000-0000-7000-8000-0000000000f1',
  missionId: '0192f000-0000-7000-8000-0000000000bb',
  projectId: '0192f000-0000-7000-8000-000000000001',
  makerId: MAKER_ID,
  author: { id: AUTHOR_ID, handle: 'bob', displayName: 'Bob', avatarUrl: null },
  firstImpression: 'It was clear what to do.',
  stuckAt: 'The second step.',
  wouldPay: true,
  wouldPayReason: 'Saves an hour.',
  suggestion: 'Label the button.',
  answers: [],
  state: 'pending',
  rejectionReason: null,
  rejectionNote: null,
  submittedAt: new Date(Date.now() - 3_600_000).toISOString(),
  settledAt: null,
  automatic: false,
} as feedback.Feedback

function viewerOf(id: string) {
  return { id, handle: 'someone', displayName: 'Someone', avatarUrl: null }
}

function renderPage(
  overrides: { report?: feedback.Feedback | null; viewerId?: string | null } = {},
): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(
    SESSION_QUERY_KEY,
    overrides.viewerId == null ? null : viewerOf(overrides.viewerId),
  )

  const report = overrides.report === undefined ? REPORT : overrides.report
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <FeedbackDetailPage
        report={report}
        mission={null as projects.Mission | null}
        project={null}
        replies={[]}
        hasMoreReplies={false}
        loadingMoreReplies={false}
        onLoadMoreReplies={() => undefined}
      />
    ),
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )
}

describe('FeedbackDetailPage (FDBK-5, FDBK-6, FDBK-9)', () => {
  describe('the settle controls (FDBK-6)', () => {
    it('are offered to the maker on a pending report', async () => {
      renderPage({ viewerId: MAKER_ID })

      expect(await screen.findByRole('button', { name: ACCEPT_LABEL })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: REJECT_LABEL })).toBeInTheDocument()
    })

    it('are not offered to the person who wrote it', async () => {
      renderPage({ viewerId: AUTHOR_ID })

      await screen.findByTestId('report-state')
      expect(screen.queryByRole('button', { name: ACCEPT_LABEL })).toBeNull()
    })

    it('are not offered to a stranger', async () => {
      renderPage({ viewerId: STRANGER_ID })

      await screen.findByTestId('report-state')
      expect(screen.queryByRole('button', { name: ACCEPT_LABEL })).toBeNull()
    })

    it('are not offered to a signed-out reader', async () => {
      renderPage({ viewerId: null })

      await screen.findByTestId('report-state')
      expect(screen.queryByRole('button', { name: ACCEPT_LABEL })).toBeNull()
    })

    /** FDBK-4: a settled report is finished; there is nothing left to decide. */
    it('are gone once it has been settled, even for the maker', async () => {
      renderPage({
        viewerId: MAKER_ID,
        report: { ...REPORT, state: 'accepted', settledAt: new Date().toISOString() },
      })

      await screen.findByTestId('report-state')
      expect(screen.queryByRole('button', { name: ACCEPT_LABEL })).toBeNull()
    })
  })

  describe('the reply box (FDBK-5)', () => {
    it.each([
      ['the maker', MAKER_ID],
      ['the feedbacker', AUTHOR_ID],
    ])('is offered to %s', async (_name, viewerId) => {
      renderPage({ viewerId })

      expect(await screen.findByLabelText(REPLY_LABEL)).toBeInTheDocument()
    })

    it('is absent for a third party, who is told why', async () => {
      renderPage({ viewerId: STRANGER_ID })

      expect(await screen.findByText(READ_ONLY_NOTICE)).toBeInTheDocument()
      expect(screen.queryByLabelText(REPLY_LABEL)).toBeNull()
    })

    it('is absent for a signed-out reader', async () => {
      renderPage({ viewerId: null })

      expect(await screen.findByText(READ_ONLY_NOTICE)).toBeInTheDocument()
    })

    /** FDBK-5 sets no window: the exchange about a rejection is worth having. */
    it('stays open on a settled report', async () => {
      renderPage({
        viewerId: AUTHOR_ID,
        report: { ...REPORT, state: 'rejected', rejectionReason: 'no_substance' },
      })

      expect(await screen.findByLabelText(REPLY_LABEL)).toBeInTheDocument()
    })
  })

  describe('the report itself (FDBK-9)', () => {
    it('is readable with no session at all', async () => {
      renderPage({ viewerId: null })

      expect(await screen.findByText('It was clear what to do.')).toBeInTheDocument()
    })

    it('renders its own not-found when there is no such report', async () => {
      renderPage({ report: null })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(NOT_FOUND_HEADING)
    })
  })
})
