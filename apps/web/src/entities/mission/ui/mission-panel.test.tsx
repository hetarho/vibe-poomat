import type { projects } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FROZEN_NOTICE, MissionPanel, NO_MISSION } from './mission-panel'

const OPEN = {
  id: '0192f000-0000-7000-8000-0000000000bb',
  projectId: '0192f000-0000-7000-8000-000000000001',
  taskText: 'Try signing up and tell me where it went wrong.',
  questions: ['Was the first screen clear?'],
  slots: 5,
  openSlots: 2,
  occupancy: { claimable: 2, held: 1, submitted: 1, settled: 1 },
  state: 'open',
  openedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  endedAt: null,
} as projects.Mission

function renderPanel(mission: projects.Mission | null = OPEN): void {
  render(<MissionPanel mission={mission} />)
}

describe('MissionPanel (PROJ-6, PROJ-7, PROJ-13)', () => {
  it('says there is nothing open when the project never ran one', () => {
    renderPanel(null)

    expect(screen.getByText(NO_MISSION)).toBeInTheDocument()
  })

  describe('an open mission', () => {
    it('shows the state and the expiry the api returned', () => {
      renderPanel()

      expect(screen.getByTestId('mission-state')).toHaveTextContent('Open')
      expect(screen.getByText(/closes 1 October 2026/)).toBeInTheDocument()
      expect(screen.getByText(/opened 1 September 2026/)).toBeInTheDocument()
    })

    it('shows where every slot stands, not just a total (FDBK-1)', () => {
      renderPanel()

      expect(screen.getByTestId('slots-claimable')).toHaveTextContent('2')
      expect(screen.getByTestId('slots-held')).toHaveTextContent('1')
      expect(screen.getByTestId('slots-submitted')).toHaveTextContent('1')
      expect(screen.getByTestId('slots-settled')).toHaveTextContent('1')
      expect(screen.getByTestId('slots-total')).toHaveTextContent('5')
    })

    it('shows the frozen task and the questions as asked (PROJ-7)', () => {
      renderPanel()

      expect(screen.getByText(OPEN.taskText)).toBeInTheDocument()
      expect(screen.getByRole('listitem')).toHaveTextContent('Was the first screen clear?')
    })

    it('says outright that none of it can change while it runs (PROJ-7)', () => {
      renderPanel()

      expect(screen.getByText(FROZEN_NOTICE)).toBeInTheDocument()
    })

    it('shows no refund summary, because nothing has been refunded', () => {
      renderPanel()

      expect(screen.queryByTestId('refund-summary')).toBeNull()
    })
  })

  describe('a mission that has ended (PROJ-6, CRED-5)', () => {
    const expired = {
      ...OPEN,
      state: 'expired',
      openSlots: 0,
      endedAt: '2026-10-01T00:00:00.000Z',
    } as projects.Mission

    it('renders as expired', () => {
      renderPanel(expired)

      expect(screen.getByTestId('mission-state')).toHaveTextContent('Expired')
      expect(screen.getByText(/ended 1 October 2026/)).toBeInTheDocument()
    })

    it('summarises what came back and what is still out', () => {
      renderPanel(expired)

      const summary = screen.getByTestId('refund-summary')
      expect(summary).toHaveTextContent('3 of 5 slots were taken; the other 2 came back.')
      expect(summary).toHaveTextContent('stay escrowed until they resolve')
    })

    it('says all of it came back when nobody took a slot', () => {
      renderPanel({
        ...expired,
        occupancy: { claimable: 5, held: 0, submitted: 0, settled: 0 },
      })

      expect(screen.getByTestId('refund-summary')).toHaveTextContent(
        'Nobody took a slot, so all 5 credits came back.',
      )
    })

    it('drops the frozen notice, because there is nothing left to freeze', () => {
      renderPanel(expired)

      expect(screen.queryByText(FROZEN_NOTICE)).toBeNull()
    })

    it.each([
      ['closed', 'Closed by the maker'],
      ['completed', 'Completed'],
    ])('renders %s in words', (state, label) => {
      renderPanel({ ...expired, state } as projects.Mission)

      expect(screen.getByTestId('mission-state')).toHaveTextContent(label)
    })
  })
})
