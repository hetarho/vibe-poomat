import type { feedback } from '@repo/contracts'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AUTO_ACCEPTED_LABEL } from '../../../entities/feedback'
import { DECIDED_HEADING, INBOX_EMPTY, MakerInboxPage, WAITING_HEADING } from './maker-inbox-page'

const HOUR = 3_600_000

function report(id: string, overrides: Partial<feedback.Feedback> = {}): feedback.Feedback {
  return {
    id,
    missionId: '0192f000-0000-7000-8000-0000000000bb',
    projectId: '0192f000-0000-7000-8000-000000000001',
    makerId: '0192f000-0000-7000-8000-0000000000aa',
    author: {
      id: '0192f000-0000-7000-8000-0000000000cc',
      handle: 'bob',
      displayName: 'Bob',
      avatarUrl: null,
    },
    firstImpression: 'It was clear what to do.',
    stuckAt: 'The second step.',
    wouldPay: true,
    wouldPayReason: 'Saves an hour.',
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

function renderInbox(reports: feedback.Feedback[]): void {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <MakerInboxPage
        reports={reports}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
    ),
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(<RouterProvider router={router as never} />)
}

describe('MakerInboxPage (FDBK-7)', () => {
  it('says so when there is nothing', async () => {
    renderInbox([])

    expect(await screen.findByText(INBOX_EMPTY)).toBeInTheDocument()
  })

  it('puts the undecided ones under their own heading, first', async () => {
    renderInbox([
      report('a'),
      report('b', { state: 'accepted', settledAt: new Date().toISOString() }),
    ])

    const headings = (await screen.findAllByRole('heading', { level: 2 })).map(
      (heading) => heading.textContent,
    )
    expect(headings).toEqual([WAITING_HEADING, DECIDED_HEADING])
  })

  it('shows how long is left on each undecided one', async () => {
    renderInbox([report('a', { submittedAt: new Date(Date.now() - 2 * HOUR).toISOString() })])

    expect(await screen.findByTestId('deadline-a')).toHaveTextContent('70h left')
  })

  it('says it is about to accept itself once the window has passed', async () => {
    renderInbox([report('a', { submittedAt: new Date(Date.now() - 80 * HOUR).toISOString() })])

    expect(await screen.findByTestId('deadline-a')).toHaveTextContent('any moment')
  })

  it('labels a settled one by how it was settled, with no deadline', async () => {
    renderInbox([report('b', { state: 'accepted', automatic: true })])

    expect(await screen.findByTestId('state-b')).toHaveTextContent(AUTO_ACCEPTED_LABEL)
    expect(screen.queryByTestId('deadline-b')).toBeNull()
  })

  it('renders no waiting section when everything is decided', async () => {
    renderInbox([report('b', { state: 'rejected', rejectionReason: 'no_substance' })])

    await screen.findByTestId('state-b')
    expect(screen.queryByText(WAITING_HEADING)).toBeNull()
  })
})
