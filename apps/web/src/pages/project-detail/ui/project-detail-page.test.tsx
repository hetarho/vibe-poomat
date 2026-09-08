import type { feedback, projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import {
  ARCHIVED_NOTICE,
  NO_FEEDBACK_YET,
  NOT_FOUND_HEADING,
  ProjectDetailPage,
} from './project-detail-page'

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: vi.fn() }) }
})

const OWNER = {
  id: '0192f000-0000-7000-8000-0000000000aa',
  handle: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
}

const PROJECT: projects.Project = {
  id: '0192f000-0000-7000-8000-000000000001',
  owner: OWNER,
  title: 'Poomat',
  liveUrl: 'https://poomat.test/app',
  pitch: 'Feedback for people who ship.',
  description: null,
  coverUrl: null,
  tags: ['Tool'],
  upvoteCount: 3,
  upvotedByViewer: false,
  activeMission: null,
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}

const REPORT = {
  id: '0192f000-0000-7000-8000-0000000000f1',
  missionId: '0192f000-0000-7000-8000-0000000000bb',
  projectId: PROJECT.id,
  author: {
    id: '0192f000-0000-7000-8000-0000000000cc',
    handle: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
  },
  firstImpression: 'It was clear what to do straight away.',
  stuckAt: 'The second step.',
  wouldPay: true,
  wouldPayReason: 'It saves me an hour.',
  suggestion: 'Label the button.',
  answers: [],
  state: 'accepted',
  rejectionReason: null,
  rejectionNote: null,
  submittedAt: '2026-09-02T00:00:00.000Z',
  settledAt: '2026-09-03T00:00:00.000Z',
  automatic: false,
} as feedback.Feedback

const MISSION = {
  id: '0192f000-0000-7000-8000-0000000000bb',
  projectId: PROJECT.id,
  taskText: 'Try signing up and tell me where it went wrong.',
  questions: [],
  slots: 3,
  openSlots: 2,
  occupancy: { claimable: 2, held: 1, submitted: 0, settled: 0 },
  state: 'open',
  openedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  endedAt: null,
} as projects.Mission

function renderPage(
  overrides: {
    project?: projects.Project | null
    missions?: projects.Mission[]
    reports?: feedback.Feedback[]
    viewer?: { id: string; handle: string } | null
  } = {},
): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, overrides.viewer ?? null)

  const project = overrides.project === undefined ? PROJECT : overrides.project
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ProjectDetailPage
        project={project}
        missions={overrides.missions ?? []}
        reports={overrides.reports ?? []}
        hasMoreReports={false}
        loadingMoreReports={false}
        onLoadMoreReports={() => undefined}
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

describe('ProjectDetailPage (PROJ-1, PROJ-8)', () => {
  describe('the live URL (PROJ-2)', () => {
    it('opens in a new tab without handing the site over', async () => {
      renderPage()

      const link = await screen.findByRole('link', { name: /Open poomat.test/ })
      expect(link).toHaveAttribute('href', 'https://poomat.test/app')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link.getAttribute('rel')).toContain('noopener')
      expect(link.getAttribute('rel')).toContain('noreferrer')
    })
  })

  describe('a project that is not there (PROJ-8)', () => {
    it('renders its own not-found rather than an error', async () => {
      renderPage({ project: null })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(NOT_FOUND_HEADING)
    })
  })

  describe('a project its owner deleted (PROJ-8)', () => {
    it('tells the owner it is archived, and that the feedback stays', async () => {
      renderPage({
        project: { ...PROJECT, deletedAt: '2026-09-05T00:00:00.000Z' },
        viewer: { id: OWNER.id, handle: OWNER.handle },
      })

      expect(await screen.findByRole('status')).toHaveTextContent(ARCHIVED_NOTICE)
    })

    /** A visitor never gets here: the api answers 404, so `project` is null. */
    it('shows no banner on a project that is not deleted', async () => {
      renderPage()

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('status')).toBeNull()
    })
  })

  describe('the mission panel', () => {
    it('says there is nothing to take when the project never ran one', async () => {
      renderPage()

      expect(await screen.findByText(/no slots to take/i)).toBeInTheDocument()
    })

    it('shows the mission state and the closing date when one is open', async () => {
      renderPage({ missions: [MISSION] })

      expect(await screen.findByTestId('mission-state')).toHaveTextContent('Open')
      expect(screen.getByText(/closes 1 October 2026/)).toBeInTheDocument()
      expect(screen.getByTestId('slots-claimable')).toHaveTextContent('2')
      expect(screen.getByTestId('slots-total')).toHaveTextContent('3')
    })
  })

  describe('the feedback list (FDBK-9)', () => {
    it('says so when there is none yet', async () => {
      renderPage()

      expect(await screen.findByText(NO_FEEDBACK_YET)).toBeInTheDocument()
    })

    it('lists what there is, by whoever wrote it', async () => {
      renderPage({ reports: [REPORT] })

      expect(await screen.findByText(/It was clear what to do/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute(
        'href',
        `/feedbacks/${REPORT.id}`,
      )
    })

    it('shows a report whose author is gone as a deleted user (AUTH-9)', async () => {
      renderPage({ reports: [{ ...REPORT, author: null }] })

      expect(await screen.findByText('deleted user')).toBeInTheDocument()
    })
  })

  describe('the description', () => {
    it('renders markdown through the sanitising renderer', async () => {
      renderPage({
        project: { ...PROJECT, description: '# Notes\n\n<script>alert(1)</script>' },
      })

      const about = await screen.findByRole('region', { name: 'About this project' })
      expect(about).toHaveTextContent('Notes')
      expect(about.querySelector('script')).toBeNull()
      expect(about.textContent).not.toContain('<script>')
    })

    it('renders no About section at all when there is none', async () => {
      renderPage()

      await screen.findByRole('heading', { level: 1 })
      expect(screen.queryByRole('region', { name: 'About this project' })).toBeNull()
    })
  })
})
