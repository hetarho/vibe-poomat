import type { feedback, projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_FIELD_LENGTH } from '../../../entities/feedback'
import {
  HOLD_LAPSED_HEADING,
  IMMUTABLE_NOTICE,
  NO_CLAIM_HEADING,
  NO_MISSION_HEADING,
  ReportPage,
  SETTLE_WINDOW,
  SUBMITTED_HEADING,
} from './report-page'

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: vi.fn() }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const MISSION_ID = '0192f000-0000-7000-8000-0000000000bb'

const MISSION = {
  id: MISSION_ID,
  projectId: PROJECT_ID,
  taskText: 'Try signing up and tell me where it went wrong.',
  questions: ['Was the first screen clear?'],
  slots: 2,
  openSlots: 1,
  occupancy: { claimable: 1, held: 1, submitted: 0, settled: 0 },
  state: 'open',
  openedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  endedAt: null,
} as projects.Mission

const PROJECT = {
  id: PROJECT_ID,
  owner: {
    id: '0192f000-0000-7000-8000-0000000000aa',
    handle: 'ada',
    displayName: 'Ada',
    avatarUrl: null,
  },
  title: 'Poomat',
  liveUrl: 'https://poomat.test/app',
  pitch: 'Feedback for people who ship.',
  description: null,
  coverUrl: null,
  tags: ['Tool'],
  upvoteCount: 0,
  upvotedByViewer: false,
  activeMission: null,
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as projects.Project

function claimOf(state: string, hoursLeft: number): feedback.Claim {
  return {
    id: '0192f000-0000-7000-8000-0000000000cc',
    missionId: MISSION_ID,
    userId: '0192f000-0000-7000-8000-0000000000dd',
    state,
    heldUntil: new Date(Date.now() + hoursLeft * 3_600_000).toISOString(),
    releasedAt: null,
    createdAt: '2026-09-08T00:00:00.000Z',
  } as feedback.Claim
}

function renderPage(
  overrides: {
    mission?: projects.Mission | null
    claim?: feedback.Claim | null
    justSubmitted?: feedback.Feedback | null
  } = {},
): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ReportPage
        mission={overrides.mission === undefined ? MISSION : overrides.mission}
        claim={overrides.claim === undefined ? claimOf('held', 12) : overrides.claim}
        project={PROJECT}
        justSubmitted={overrides.justSubmitted ?? null}
        onSubmitted={() => undefined}
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

function form(): HTMLElement | null {
  return screen.queryByRole('form', { name: 'Feedback report' })
}

describe('ReportPage (FDBK-1, FDBK-3, FDBK-4)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('with a live hold', () => {
    it('renders the form', async () => {
      renderPage()

      expect(await screen.findByRole('form', { name: 'Feedback report' })).toBeInTheDocument()
    })

    /** PROJ-7 freezes the task so that what is on screen is what was asked. */
    it('shows the task and the questions beside it', async () => {
      renderPage()

      await screen.findByRole('form', { name: 'Feedback report' })
      expect(screen.getByText(MISSION.taskText)).toBeInTheDocument()
      expect(screen.getAllByText('Was the first screen clear?').length).toBeGreaterThan(0)
    })

    it('links out to the thing being reviewed (PROJ-2)', async () => {
      renderPage()

      const link = await screen.findByRole('link', { name: /Open poomat.test/ })
      expect(link).toHaveAttribute('href', PROJECT.liveUrl)
      expect(link).toHaveAttribute('target', '_blank')
    })

    it('says the report cannot be changed before it is written (FDBK-4)', async () => {
      renderPage()

      await screen.findByRole('form', { name: 'Feedback report' })
      expect(screen.getByText(new RegExp(IMMUTABLE_NOTICE))).toBeInTheDocument()
    })
  })

  describe('with a hold that has lapsed (FDBK-1)', () => {
    it('replaces the form with the expired state', async () => {
      renderPage({ claim: claimOf('held', -1) })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
        HOLD_LAPSED_HEADING,
      )
      expect(form()).toBeNull()
    })

    it('points back to the project, where a slot can be taken again', async () => {
      renderPage({ claim: claimOf('held', -1) })

      await screen.findByRole('heading', { level: 1 })
      expect(screen.getByText(/still slots on this mission/)).toBeInTheDocument()
    })

    it('says every slot is taken when none are left', async () => {
      renderPage({
        claim: claimOf('held', -1),
        mission: {
          ...MISSION,
          occupancy: { claimable: 0, held: 2, submitted: 0, settled: 0 },
        },
      })

      expect(await screen.findByText(/Every slot is taken/)).toBeInTheDocument()
    })
  })

  describe('with no hold at all', () => {
    it('says so rather than showing a form that could not be submitted', async () => {
      renderPage({ claim: null })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(NO_CLAIM_HEADING)
      expect(form()).toBeNull()
    })
  })

  describe('once the report is in (FDBK-4)', () => {
    it('replaces the form with a read-only statement', async () => {
      renderPage({ claim: claimOf('submitted', -1) })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(SUBMITTED_HEADING)
      expect(form()).toBeNull()
      expect(screen.getByText(IMMUTABLE_NOTICE)).toBeInTheDocument()
    })

    it('says the maker has 72 hours (FDBK-7)', async () => {
      renderPage({ claim: claimOf('submitted', -1) })

      expect(await screen.findByText(SETTLE_WINDOW)).toBeInTheDocument()
    })

    /** The claim cache has not caught up yet; this visit knows it submitted. */
    it('says so straight away after submitting, before the claim refetches', async () => {
      renderPage({
        claim: claimOf('held', 12),
        justSubmitted: { id: 'f-1' } as feedback.Feedback,
      })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(SUBMITTED_HEADING)
      expect(form()).toBeNull()
    })
  })

  describe('a mission that is not there', () => {
    it('renders its own not-found', async () => {
      renderPage({ mission: null })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(NO_MISSION_HEADING)
    })
  })

  it('shows the field minimum on the form (FDBK-10)', async () => {
    renderPage()

    await screen.findByRole('form', { name: 'Feedback report' })
    expect(screen.getAllByText(new RegExp(`/ ${MIN_FIELD_LENGTH} minimum`)).length).toBe(5)
  })
})
