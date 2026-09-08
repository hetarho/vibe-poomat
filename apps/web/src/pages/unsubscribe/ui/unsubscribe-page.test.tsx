import type { notifications } from '@repo/contracts'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NOTIFICATION_LABELS } from '../../../entities/notification-preference'
import {
  DONE_HEADING,
  FAILED_HEADING,
  FALLBACK_REASON,
  OTHERS_UNAFFECTED,
  UnsubscribePage,
} from './unsubscribe-page'

const ACCOUNT_ID = '0192f000-0000-7000-8000-0000000000aa'
const HANDLE = 'ada'

function renderPage(props: {
  type?: notifications.NotificationType | null
  error?: string | null
}): void {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <UnsubscribePage type={props.type ?? null} error={props.error ?? null} />,
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(<RouterProvider router={router as never} />)
}

describe('UnsubscribePage (NOTI-4)', () => {
  describe('when one type was switched off', () => {
    it('says which one, in the words settings uses', async () => {
      renderPage({ type: 'thread_reply' })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(DONE_HEADING)
      expect(screen.getByText(NOTIFICATION_LABELS.thread_reply)).toBeInTheDocument()
    })

    it('says the others are unaffected', async () => {
      renderPage({ type: 'feedback_accepted' })

      expect(await screen.findByText(OTHERS_UNAFFECTED)).toBeInTheDocument()
    })

    it('links to settings, where it can be turned back on', async () => {
      renderPage({ type: 'feedback_accepted' })

      expect(await screen.findByRole('link', { name: 'Notification settings' })).toHaveAttribute(
        'href',
        '/settings',
      )
    })

    it('names exactly one type, never a list', async () => {
      renderPage({ type: 'mission_ended' })

      await screen.findByRole('heading', { level: 1 })
      const named = Object.values(NOTIFICATION_LABELS).filter(
        (label) => screen.queryByText(label) !== null,
      )
      expect(named).toEqual([NOTIFICATION_LABELS.mission_ended])
    })
  })

  describe('when the link was refused', () => {
    it('renders a plain failure for a tampered token', async () => {
      renderPage({ error: 'UNSUBSCRIBE_TOKEN_NOT_ALLOWED' })

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(FAILED_HEADING)
      expect(screen.getByText(/had been changed/)).toBeInTheDocument()
    })

    it('explains the one that cannot be switched off (NOTI-3)', async () => {
      renderPage({ error: 'NOTIFICATION_ALWAYS_ON' })

      expect(await screen.findByText(/moves your credits/)).toBeInTheDocument()
    })

    it('falls back rather than echoing a code it does not know', async () => {
      renderPage({ error: 'SOMETHING_ELSE' })

      expect(await screen.findByText(FALLBACK_REASON)).toBeInTheDocument()
      expect(screen.queryByText(/SOMETHING_ELSE/)).toBeNull()
    })

    it('still offers the way to settings', async () => {
      renderPage({ error: 'UNSUBSCRIBE_TOKEN_NOT_ALLOWED' })

      expect(await screen.findByRole('link', { name: 'Notification settings' })).toBeInTheDocument()
    })
  })

  /**
   * The api sends only a type or a code here. Whose link it was is never on the
   * page, so a link forwarded to somebody else tells them nothing.
   */
  describe('what it never says', () => {
    it.each([
      ['a success', { type: 'thread_reply' as notifications.NotificationType }],
      ['a failure', { error: 'UNSUBSCRIBE_TOKEN_NOT_ALLOWED' }],
    ])('reveals no account on %s', async (_name, props) => {
      renderPage(props)

      const page = await screen.findByRole('heading', { level: 1 })
      const text = page.ownerDocument.body.textContent ?? ''
      expect(text).not.toContain(ACCOUNT_ID)
      expect(text).not.toContain(HANDLE)
      expect(text).not.toMatch(/@/)
    })
  })
})
