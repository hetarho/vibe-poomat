import type { feedback, projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MIN_FIELD_LENGTH, REPORT_LABELS } from '../../../entities/feedback'
import { draftKey } from '../model/use-report-draft'
import { DRAFT_RESTORED, ReportForm, SUBMIT_LABEL } from './report-form'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const MISSION_ID = '0192f000-0000-7000-8000-0000000000bb'
const CLAIM_ID = '0192f000-0000-7000-8000-0000000000cc'

const ENOUGH = 'a'.repeat(MIN_FIELD_LENGTH)
const ONE_SHORT = 'a'.repeat(MIN_FIELD_LENGTH - 1)

const CLAIM = {
  id: CLAIM_ID,
  missionId: MISSION_ID,
  userId: '0192f000-0000-7000-8000-0000000000dd',
  state: 'held',
  heldUntil: '2026-09-09T12:00:00.000Z',
  releasedAt: null,
  createdAt: '2026-09-08T12:00:00.000Z',
} as feedback.Claim

function missionWith(questions: string[]): projects.Mission {
  return {
    id: MISSION_ID,
    projectId: PROJECT_ID,
    taskText: 'Try signing up.',
    questions,
    slots: 2,
    openSlots: 1,
    occupancy: { claimable: 1, held: 1, submitted: 0, settled: 0 },
    state: 'open',
    openedAt: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-10-01T00:00:00.000Z',
    endedAt: null,
  } as projects.Mission
}

function renderForm(questions: string[] = [], onSubmitted = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={client}>
      <ReportForm
        claim={CLAIM}
        mission={missionWith(questions)}
        projectId={PROJECT_ID}
        onSubmitted={onSubmitted}
      />
    </QueryClientProvider>,
  )

  return { view, onSubmitted }
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`${SUBMIT_LABEL}|Submitting`) })
}

async function fillEveryField(answers: string[] = []): Promise<void> {
  for (const label of Object.values(REPORT_LABELS)) {
    await userEvent.type(screen.getByLabelText(label), ENOUGH)
  }
  for (const [index, answer] of answers.entries()) {
    await userEvent.type(screen.getByLabelText(answers[index] as string), answer)
  }
}

describe('ReportForm (FDBK-3, FDBK-4, FDBK-10)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { id: 'f-1', state: 'pending' } })
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('the fixed shape (FDBK-3)', () => {
    it('asks for every field the decision names, and no others', () => {
      renderForm()

      for (const label of Object.values(REPORT_LABELS)) {
        expect(screen.getByLabelText(label)).toBeInTheDocument()
      }
      expect(screen.getByRole('radio', { name: 'Yes' })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument()
    })

    it('adds one input per mission question, labelled by the question', () => {
      renderForm(['Was the first screen clear?', 'Would you come back?'])

      expect(screen.getByLabelText('Was the first screen clear?')).toBeInTheDocument()
      expect(screen.getByLabelText('Would you come back?')).toBeInTheDocument()
    })

    it('shows no question section when the maker asked none', () => {
      renderForm()

      expect(screen.queryByText('What the maker asked')).toBeNull()
    })
  })

  describe('the 20-character floor (FDBK-10)', () => {
    it('counts each field towards the minimum', async () => {
      renderForm()

      await userEvent.type(screen.getByLabelText(REPORT_LABELS.suggestion), 'abc')

      expect(screen.getByTestId('suggestion-counter')).toHaveTextContent(
        `3 / ${MIN_FIELD_LENGTH} minimum`,
      )
    })

    it('blocks a field one character short, and names which one', async () => {
      renderForm()
      await fillEveryField()
      await userEvent.clear(screen.getByLabelText(REPORT_LABELS.stuckAt))
      await userEvent.type(screen.getByLabelText(REPORT_LABELS.stuckAt), ONE_SHORT)

      await userEvent.click(submitButton())

      expect(post).not.toHaveBeenCalled()
      expect(screen.getByText(new RegExp(`${REPORT_LABELS.stuckAt}:`))).toBeInTheDocument()
    })

    it('blocks a short answer to a mission question too', async () => {
      renderForm(['Was the first screen clear?'])
      await fillEveryField()
      await userEvent.type(screen.getByLabelText('Was the first screen clear?'), ONE_SHORT)

      await userEvent.click(submitButton())

      expect(post).not.toHaveBeenCalled()
    })

    it('sends it once every field passes', async () => {
      renderForm()
      await fillEveryField()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/claims/{claimId}/feedback', {
          params: { path: { claimId: CLAIM_ID } },
          body: {
            firstImpression: ENOUGH,
            stuckAt: ENOUGH,
            wouldPay: false,
            wouldPayReason: ENOUGH,
            suggestion: ENOUGH,
            answers: [],
          },
        })
      })
    })

    it('sends the "would you pay" choice as it was made', async () => {
      renderForm()
      await fillEveryField()
      await userEvent.click(screen.getByRole('radio', { name: 'Yes' }))

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(post.mock.calls[0]?.[1]?.body).toMatchObject({ wouldPay: true })
      })
    })
  })

  /** A refresh must not cost somebody the report they were writing. */
  describe('the local draft', () => {
    it('survives a remount, keyed to this claim', async () => {
      const { view } = renderForm()
      await userEvent.type(screen.getByLabelText(REPORT_LABELS.firstImpression), ENOUGH)

      view.unmount()
      renderForm()

      expect(await screen.findByText(DRAFT_RESTORED)).toBeInTheDocument()
      expect(screen.getByLabelText(REPORT_LABELS.firstImpression)).toHaveValue(ENOUGH)
    })

    it('says nothing about a draft on a first visit', () => {
      renderForm()

      expect(screen.queryByText(DRAFT_RESTORED)).toBeNull()
    })

    it('is cleared once the report is in, so it cannot come back', async () => {
      renderForm()
      await fillEveryField()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(localStorage.getItem(draftKey(CLAIM_ID))).toBeNull()
      })
    })

    it('is left alone when the submit failed, so nothing is lost', async () => {
      post.mockRejectedValue(new Error('offline'))
      renderForm()
      await fillEveryField()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument()
      })
      expect(localStorage.getItem(draftKey(CLAIM_ID))).not.toBeNull()
    })
  })

  describe('once it is in (FDBK-4)', () => {
    it('hands the report back to the caller, which replaces the form', async () => {
      const { onSubmitted } = renderForm()
      await fillEveryField()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(onSubmitted).toHaveBeenCalledTimes(1)
      })
    })

    it('says outright that it cannot be changed', () => {
      renderForm()

      expect(screen.getByText(/cannot be changed/i)).toBeInTheDocument()
    })
  })
})
