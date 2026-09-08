import { ApiError } from '@repo/api-client'
import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { myClaimQueryKey } from '../../../entities/feedback'
import { claimRefusal } from '../lib/claim-refusals'
import { ALREADY_SETTLED, ClaimSlotBlock, NO_SLOTS_LEFT, REPORT_IS_IN } from './claim-slot-block'
import { START_LABEL } from './start-control'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post, DELETE: vi.fn() }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const MISSION_ID = '0192f000-0000-7000-8000-0000000000bb'
const CLAIM_ID = '0192f000-0000-7000-8000-0000000000cc'

const MISSION = {
  id: MISSION_ID,
  projectId: PROJECT_ID,
  taskText: 'Try signing up.',
  questions: [],
  slots: 2,
  openSlots: 2,
  occupancy: { claimable: 2, held: 0, submitted: 0, settled: 0 },
  state: 'open',
  openedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  endedAt: null,
} as projects.Mission

function claimOf(state: string, heldUntil: string) {
  return {
    id: CLAIM_ID,
    missionId: MISSION_ID,
    userId: '0192f000-0000-7000-8000-0000000000dd',
    state,
    heldUntil,
    releasedAt: null,
    createdAt: '2026-09-08T00:00:00.000Z',
  }
}

/**
 * A few seconds of slack, because the countdown floors to whole minutes: a
 * fixture built one millisecond under the hour would read as "59m left".
 */
function inHours(hours: number): string {
  const slack = hours > 0 ? 5_000 : 0

  return new Date(Date.now() + hours * 3_600_000 + slack).toISOString()
}

/** The block renders Links once a hold is running, so it needs a router. */
function renderBlock(options: { claim?: unknown; mission?: projects.Mission } = {}): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(myClaimQueryKey(MISSION_ID), options.claim ?? null)

  const mission = options.mission ?? MISSION
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <ClaimSlotBlock mission={mission} projectId={PROJECT_ID} />,
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )

  return client
}

describe('ClaimSlotBlock (FDBK-1, FDBK-2)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: claimOf('held', inHours(24)) })
  })

  describe('with nothing held', () => {
    it('offers Start while slots remain', async () => {
      renderBlock()

      expect(await screen.findByRole('button', { name: START_LABEL })).toBeEnabled()
    })

    it('says so instead when every slot is taken', async () => {
      renderBlock({
        mission: {
          ...MISSION,
          occupancy: { claimable: 0, held: 2, submitted: 0, settled: 0 },
        },
      })

      expect(await screen.findByText(NO_SLOTS_LEFT)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: START_LABEL })).toBeNull()
    })

    it('takes a slot and shows the hold that came back', async () => {
      renderBlock()

      await userEvent.click(await screen.findByRole('button', { name: START_LABEL }))

      expect(await screen.findByTestId('hold-countdown')).toHaveTextContent('24 hours left')
      expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/missions/{missionId}/claims', {
        params: { path: { missionId: MISSION_ID } },
      })
    })
  })

  /** Each refusal is a different situation, and three of them are actionable. */
  describe('when the server refuses', () => {
    it.each(['NO_SLOTS_AVAILABLE', 'ALREADY_CLAIMED', 'MISSION_NOT_OPEN', 'OWN_PROJECT'])(
      'renders the message for %s',
      async (code) => {
        const error = new ApiError(409, { code, message: 'server text' })
        post.mockRejectedValue(error)
        renderBlock()

        await userEvent.click(await screen.findByRole('button', { name: START_LABEL }))

        expect(await screen.findByRole('alert')).toHaveTextContent(claimRefusal(error))
      },
    )
  })

  describe('with a hold already running', () => {
    it('shows the countdown and the way to the report', async () => {
      renderBlock({ claim: claimOf('held', inHours(3)) })

      expect(await screen.findByTestId('hold-countdown')).toHaveTextContent('3 hours left')
      expect(screen.getByRole('link', { name: 'Write the report' })).toHaveAttribute(
        'href',
        `/missions/${MISSION_ID}/report`,
      )
    })

    it('offers no Start, because FDBK-2 gives one slot each', async () => {
      renderBlock({ claim: claimOf('held', inHours(3)) })

      await screen.findByTestId('hold-countdown')
      expect(screen.queryByRole('button', { name: START_LABEL })).toBeNull()
    })

    it('renders a lapsed hold as lapsed rather than as time remaining', async () => {
      renderBlock({ claim: claimOf('held', inHours(-1)) })

      expect(await screen.findByTestId('hold-lapsed')).toBeInTheDocument()
      expect(screen.queryByTestId('hold-countdown')).toBeNull()
    })
  })

  describe('once the report is in', () => {
    it('says the maker has 72 hours', async () => {
      renderBlock({ claim: claimOf('submitted', inHours(-1)) })

      expect(await screen.findByText(REPORT_IS_IN)).toBeInTheDocument()
    })

    it('says so plainly once it is settled', async () => {
      renderBlock({ claim: claimOf('settled', inHours(-1)) })

      expect(await screen.findByText(ALREADY_SETTLED)).toBeInTheDocument()
    })
  })
})
