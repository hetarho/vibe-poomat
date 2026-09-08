import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLOSE_MISSION_LABEL,
  CloseMissionDialog,
  HELD_RULE,
  REFUND_RULE,
} from './close-mission-dialog'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const MISSION_ID = '0192f000-0000-7000-8000-0000000000bb'

const MISSION = {
  id: MISSION_ID,
  projectId: PROJECT_ID,
  taskText: 'Try signing up.',
  questions: [],
  slots: 3,
  openSlots: 2,
  occupancy: { claimable: 2, held: 1, submitted: 0, settled: 0 },
  state: 'open',
  openedAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  endedAt: null,
} as projects.Mission

function renderDialog(mission: projects.Mission = MISSION): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <CloseMissionDialog projectId={PROJECT_ID} mission={mission} />
    </QueryClientProvider>,
  )
}

/** Renders and opens: the trigger and the confirm share a label, so the
 * trigger is only unambiguous before the dialog exists. */
async function openDialog(mission: projects.Mission = MISSION): Promise<HTMLElement> {
  renderDialog(mission)
  await userEvent.click(screen.getByRole('button', { name: CLOSE_MISSION_LABEL }))

  return screen.findByRole('dialog')
}

describe('CloseMissionDialog (PROJ-6, CRED-5)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { ...MISSION, state: 'closed' } })
  })

  describe('what it says before closing', () => {
    it('states the refund rule and how many slots that is right now', async () => {
      const dialog = await openDialog()

      expect(dialog).toHaveTextContent(REFUND_RULE)
      expect(dialog).toHaveTextContent('That is 2 of 3 right now.')
    })

    it('states that a held slot stays open and stays escrowed', async () => {
      const dialog = await openDialog()

      expect(dialog).toHaveTextContent(HELD_RULE)
    })

    it('says how many people are mid-report, so the number is not a surprise', async () => {
      const dialog = await openDialog()

      expect(dialog).toHaveTextContent('1 person is on it at the moment.')
    })

    it('says nothing about people when nobody is on it', async () => {
      const dialog = await openDialog({
        ...MISSION,
        occupancy: { claimable: 3, held: 0, submitted: 0, settled: 0 },
      })

      expect(dialog).not.toHaveTextContent('at the moment')
    })
  })

  describe('closing it', () => {
    it('calls the endpoint once, for that mission', async () => {
      const dialog = await openDialog()

      await userEvent.click(
        await within(dialog).findByRole('button', { name: CLOSE_MISSION_LABEL }),
      )

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/missions/{id}/close', {
          params: { path: { id: MISSION_ID } },
        })
      })
    })

    it('does nothing at all if the confirmation is declined', async () => {
      const dialog = await openDialog()

      await userEvent.click(await within(dialog).findByRole('button', { name: 'Leave it open' }))

      expect(post).not.toHaveBeenCalled()
    })
  })
})
