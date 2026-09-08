import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MY_CREDITS_QUERY_KEY } from '../../../entities/credit'
import { CLOSE_MISSION_LABEL } from '../../../features/close-mission'
import { ALREADY_OPEN, OPEN_MISSION_SUBMIT } from '../../../features/open-mission'
import OwnerMissionBlock, { OPEN_A_MISSION_HEADING } from './owner-mission-block'

const get = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ GET: get, POST: vi.fn() }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'

const MISSION = {
  id: '0192f000-0000-7000-8000-0000000000bb',
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

function renderBlock(openMission: projects.Mission | null): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(MY_CREDITS_QUERY_KEY, {
    balance: 4,
    escrowed: 0,
    received: 0,
    given: 0,
    ledger: { items: [], nextCursor: null },
  })

  render(
    <QueryClientProvider client={client}>
      <OwnerMissionBlock projectId={PROJECT_ID} openMission={openMission} />
    </QueryClientProvider>,
  )
}

describe('the owner’s mission controls (PROJ-5)', () => {
  beforeEach(() => {
    get.mockReset()
  })

  describe('with a mission already open', () => {
    it('offers no way to open another one', () => {
      renderBlock(MISSION)

      expect(screen.queryByRole('button', { name: OPEN_MISSION_SUBMIT })).toBeNull()
      expect(screen.queryByText(OPEN_A_MISSION_HEADING)).toBeNull()
    })

    it('explains why, rather than leaving the absence unexplained', () => {
      renderBlock(MISSION)

      expect(screen.getByText(ALREADY_OPEN)).toBeInTheDocument()
    })

    it('offers the way out instead: closing it', () => {
      renderBlock(MISSION)

      expect(screen.getByRole('button', { name: CLOSE_MISSION_LABEL })).toBeEnabled()
    })
  })

  describe('with none open', () => {
    it('offers the form, with the balance the escrow comes from', () => {
      renderBlock(null)

      expect(screen.getByRole('heading', { name: OPEN_A_MISSION_HEADING })).toBeInTheDocument()
      expect(screen.getByTestId('cost-preview')).toHaveTextContent('You have 4')
    })

    it('offers nothing to close', () => {
      renderBlock(null)

      expect(screen.queryByRole('button', { name: CLOSE_MISSION_LABEL })).toBeNull()
    })
  })
})
