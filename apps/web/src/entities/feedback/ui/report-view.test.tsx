import type { feedback } from '@repo/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_LABEL,
  AUTO_ACCEPTED_LABEL,
  PENDING_LABEL,
  REASON_LABEL,
  REJECTED_LABEL,
  ReportView,
} from './report-view'

const HOUR = 3_600_000

function report(overrides: Partial<feedback.Feedback> = {}): feedback.Feedback {
  return {
    id: '0192f000-0000-7000-8000-0000000000f1',
    missionId: '0192f000-0000-7000-8000-0000000000bb',
    projectId: '0192f000-0000-7000-8000-000000000001',
    makerId: '0192f000-0000-7000-8000-0000000000aa',
    author: {
      id: '0192f000-0000-7000-8000-0000000000cc',
      handle: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    },
    firstImpression: 'It was clear what to do straight away.',
    stuckAt: 'The second step.',
    wouldPay: true,
    wouldPayReason: 'It saves me an hour a week.',
    suggestion: 'Label the button.',
    answers: [],
    state: 'pending',
    rejectionReason: null,
    rejectionNote: null,
    submittedAt: new Date(Date.now() - HOUR).toISOString(),
    settledAt: null,
    automatic: false,
    ...overrides,
  } as feedback.Feedback
}

function renderView(
  overrides: Partial<feedback.Feedback> = {},
  options: { questions?: string[]; isMaker?: boolean } = {},
): void {
  render(
    <ReportView
      report={report(overrides)}
      questions={options.questions ?? []}
      isMaker={options.isMaker ?? false}
    />,
  )
}

describe('ReportView (FDBK-3, FDBK-6, FDBK-7, FDBK-9)', () => {
  describe('the report itself', () => {
    it('renders every field that was written', () => {
      renderView()

      expect(screen.getByText('It was clear what to do straight away.')).toBeInTheDocument()
      expect(screen.getByText('The second step.')).toBeInTheDocument()
      expect(screen.getByTestId('would-pay')).toHaveTextContent('Yes')
      expect(screen.getByText('Label the button.')).toBeInTheDocument()
    })

    it('labels each answer with the question it answers (PROJ-7)', () => {
      renderView({ answers: ['It was clear.'] }, { questions: ['Was the first screen clear?'] })

      expect(screen.getByText('Was the first screen clear?')).toBeInTheDocument()
      expect(screen.getByText('It was clear.')).toBeInTheDocument()
    })

    it('shows an author who has gone as a deleted user (AUTH-9, FDBK-9)', () => {
      renderView({ author: null })

      expect(screen.getByText('deleted user')).toBeInTheDocument()
    })
  })

  /** FDBK-7: "the clock decided" says something different from "I decided". */
  describe('the state, in words', () => {
    it.each([
      ['pending', { state: 'pending' }, PENDING_LABEL],
      ['accepted by hand', { state: 'accepted', automatic: false }, ACCEPTED_LABEL],
      ['accepted by the clock', { state: 'accepted', automatic: true }, AUTO_ACCEPTED_LABEL],
      ['rejected', { state: 'rejected', rejectionReason: 'no_substance' }, REJECTED_LABEL],
    ])('renders %s as its own label', (_name, overrides, label) => {
      renderView(overrides as Partial<feedback.Feedback>)

      expect(screen.getByTestId('report-state')).toHaveTextContent(label as string)
    })

    it('tells an automatic accept apart from a manual one', () => {
      expect(AUTO_ACCEPTED_LABEL).not.toBe(ACCEPTED_LABEL)
    })
  })

  describe('the deadline on a pending report (FDBK-7)', () => {
    it('is shown to a reader, phrased as the maker’s', () => {
      renderView()

      expect(screen.getByTestId('settle-deadline')).toHaveTextContent('The maker has until')
    })

    it('is shown to the maker as theirs', () => {
      renderView({}, { isMaker: true })

      expect(screen.getByTestId('settle-deadline')).toHaveTextContent('You have until')
    })

    it('warns the maker once the 48-hour mark has passed', () => {
      renderView({ submittedAt: new Date(Date.now() - 50 * HOUR).toISOString() }, { isMaker: true })

      expect(screen.getByTestId('settle-warning')).toHaveTextContent('48-hour mark')
    })

    it('says nothing about the warning before that mark', () => {
      renderView({ submittedAt: new Date(Date.now() - 2 * HOUR).toISOString() }, { isMaker: true })

      expect(screen.queryByTestId('settle-warning')).toBeNull()
    })

    it('never warns a reader who is not the maker', () => {
      renderView({ submittedAt: new Date(Date.now() - 50 * HOUR).toISOString() })

      expect(screen.queryByTestId('settle-warning')).toBeNull()
    })

    it('is gone once it has been settled', () => {
      renderView({ state: 'accepted', settledAt: new Date().toISOString() })

      expect(screen.queryByTestId('settle-deadline')).toBeNull()
    })
  })

  /** FDBK-9: a rejection stays public with its reason, which is the point. */
  describe('a rejection', () => {
    it('shows the fixed reason', () => {
      renderView({ state: 'rejected', rejectionReason: 'task_not_done' })

      expect(screen.getByTestId('rejection')).toHaveTextContent(REASON_LABEL.task_not_done)
    })

    it('shows the maker’s note when there is one', () => {
      renderView({
        state: 'rejected',
        rejectionReason: 'no_substance',
        rejectionNote: 'The task was about the export, not the sign-up.',
      })

      expect(screen.getByTestId('rejection')).toHaveTextContent('not the sign-up')
    })

    it('says the rejection is public and counts towards the rate (FDBK-8)', () => {
      renderView({ state: 'rejected', rejectionReason: 'spam_abuse' })

      expect(screen.getByTestId('rejection')).toHaveTextContent(/rejection rate/i)
    })

    it('shows nothing of the sort on an accepted one', () => {
      renderView({ state: 'accepted' })

      expect(screen.queryByTestId('rejection')).toBeNull()
    })
  })
})
