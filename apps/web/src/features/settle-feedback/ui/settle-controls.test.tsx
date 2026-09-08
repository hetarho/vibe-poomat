import { ApiError } from '@repo/api-client'
import type { feedback } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACCEPT_CONSEQUENCE,
  ALL_REASONS_OFFERED,
  REJECT_CONSEQUENCE,
  REJECTION_REASON_OPTIONS,
} from '../lib/consequences'
import {
  ACCEPT_LABEL,
  ALREADY_SETTLED_NOTICE,
  REJECT_LABEL,
  SettleControls,
} from './settle-controls'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const REPORT_ID = '0192f000-0000-7000-8000-0000000000f1'

const REPORT = {
  id: REPORT_ID,
  missionId: '0192f000-0000-7000-8000-0000000000bb',
  projectId: '0192f000-0000-7000-8000-000000000001',
  makerId: '0192f000-0000-7000-8000-0000000000aa',
  author: {
    id: '0192f000-0000-7000-8000-0000000000cc',
    handle: 'bob',
    displayName: 'Bob',
    avatarUrl: null,
  },
  firstImpression: 'It was clear.',
  stuckAt: 'The second step.',
  wouldPay: true,
  wouldPayReason: 'Saves an hour.',
  suggestion: 'Label the button.',
  answers: [],
  state: 'pending',
  rejectionReason: null,
  rejectionNote: null,
  submittedAt: '2026-09-08T12:00:00.000Z',
  settledAt: null,
  automatic: false,
} as feedback.Feedback

function renderControls(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <SettleControls report={REPORT} />
    </QueryClientProvider>,
  )
}

async function openReject(): Promise<HTMLElement> {
  await userEvent.click(screen.getByRole('button', { name: REJECT_LABEL }))

  return screen.findByRole('dialog')
}

describe('SettleControls (FDBK-6, CRED-4)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { ...REPORT, state: 'accepted' } })
  })

  describe('what it says about the credit before deciding (CRED-4)', () => {
    it('states where the credit goes on an accept', () => {
      renderControls()

      expect(screen.getByText(ACCEPT_CONSEQUENCE)).toBeInTheDocument()
    })

    it('states where it goes on a reject, in the reject dialog', async () => {
      renderControls()

      expect(await openReject()).toHaveTextContent(REJECT_CONSEQUENCE)
    })

    /** The two are the same movement described from opposite ends. */
    it('says something different for each action', () => {
      expect(ACCEPT_CONSEQUENCE).not.toBe(REJECT_CONSEQUENCE)
      expect(ACCEPT_CONSEQUENCE).toMatch(/to the feedbacker/i)
      expect(REJECT_CONSEQUENCE).toMatch(/back to your balance/i)
    })
  })

  describe('accepting', () => {
    it('calls accept once, and nothing else', async () => {
      renderControls()

      await userEvent.click(screen.getByRole('button', { name: ACCEPT_LABEL }))

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/feedbacks/{id}/accept', {
          params: { path: { id: REPORT_ID } },
        })
      })
    })
  })

  describe('rejecting (FDBK-6)', () => {
    it('offers exactly the three fixed reasons', async () => {
      renderControls()
      const dialog = await openReject()

      for (const option of REJECTION_REASON_OPTIONS) {
        expect(
          within(dialog).getByRole('radio', { name: new RegExp(option.label) }),
        ).toBeInTheDocument()
      }
      expect(within(dialog).getAllByRole('radio')).toHaveLength(REJECTION_REASON_OPTIONS.length)
    })

    it('offers every reason the contract names', () => {
      expect(ALL_REASONS_OFFERED).toBe(true)
    })

    it('will not send without one of them', async () => {
      renderControls()
      const dialog = await openReject()

      const confirm = within(dialog).getByRole('button', { name: REJECT_LABEL })
      expect(confirm).toBeDisabled()
      await userEvent.click(confirm)
      expect(post).not.toHaveBeenCalled()
    })

    it('sends the reason once one is picked, with no note', async () => {
      renderControls()
      const dialog = await openReject()
      await userEvent.click(within(dialog).getByRole('radio', { name: /Nothing substantial/ }))

      await userEvent.click(within(dialog).getByRole('button', { name: REJECT_LABEL }))

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/feedbacks/{id}/reject', {
          params: { path: { id: REPORT_ID } },
          body: { reason: 'no_substance', note: null },
        })
      })
    })

    it('sends the note when one was written', async () => {
      renderControls()
      const dialog = await openReject()
      await userEvent.click(within(dialog).getByRole('radio', { name: /task was not done/ }))
      await userEvent.type(within(dialog).getByLabelText(/Anything to add/), '  Wrong feature.  ')

      await userEvent.click(within(dialog).getByRole('button', { name: REJECT_LABEL }))

      await waitFor(() => {
        expect(post.mock.calls[0]?.[1]?.body).toEqual({
          reason: 'task_not_done',
          note: 'Wrong feature.',
        })
      })
    })

    it('says the report stays public, so the rate is no surprise (FDBK-8)', async () => {
      renderControls()

      expect(await openReject()).toHaveTextContent(/stays public/i)
    })
  })

  describe('when it was already settled', () => {
    it('says so rather than showing a generic failure', async () => {
      post.mockRejectedValue(
        new ApiError(409, { code: 'FEEDBACK_ALREADY_SETTLED', message: 'already settled' }),
      )
      renderControls()

      await userEvent.click(screen.getByRole('button', { name: ACCEPT_LABEL }))

      expect(await screen.findByRole('alert')).toHaveTextContent(ALREADY_SETTLED_NOTICE)
    })

    it('does not retry it', async () => {
      post.mockRejectedValue(
        new ApiError(409, { code: 'FEEDBACK_ALREADY_SETTLED', message: 'already settled' }),
      )
      renderControls()

      await userEvent.click(screen.getByRole('button', { name: ACCEPT_LABEL }))

      await screen.findByRole('alert')
      expect(post).toHaveBeenCalledTimes(1)
    })
  })
})
