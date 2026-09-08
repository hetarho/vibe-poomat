import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../../../entities/session'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { SIGN_IN_TITLE } from '../../../features/auth'
import { HeaderAuth, SIGN_IN_LABEL, SIGN_OUT_LABEL } from './header-auth'

const logout = vi.fn(async () => ({ data: undefined }))

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return {
    ...actual,
    apiClient: async () => ({ POST: logout, GET: vi.fn() }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options: { select: (state: unknown) => unknown }) =>
    options.select({ location: { pathname: '/projects/abc', searchStr: '?tab=feedback' } }),
}))

const ADA: CurrentUser = {
  id: '0192a1b2-c3d4-7000-8000-0123456789ab',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  bio: null,
  link: null,
  createdAt: new Date().toISOString(),
  credits: { balance: 2, received: 0, given: 0 },
  makerStats: {
    settledCount: 0,
    rejectedCount: 0,
    rejectionRate: null,
    reasons: { task_not_done: 0, no_substance: 0, spam_abuse: 0 },
  },
  email: 'ada@example.com',
  providers: ['github'],
}

/**
 * The session is prefetched during SSR, so a render test seeds the cache the
 * same way: whatever the header does, it does it on the first paint.
 */
function renderWith(user: CurrentUser | null): { client: QueryClient; ui: ReactElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, user)
  const ui = (
    <QueryClientProvider client={client}>
      <HeaderAuth />
    </QueryClientProvider>
  )
  render(ui)

  return { client, ui }
}

describe('HeaderAuth', () => {
  beforeEach(() => {
    logout.mockClear()
  })

  describe('signed out', () => {
    it('offers the sign-in trigger and no account menu', () => {
      renderWith(null)

      expect(screen.getByRole('button', { name: SIGN_IN_LABEL })).toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: 'Account' })).not.toBeInTheDocument()
    })

    it('opens a dialog offering both providers, and no password field (AUTH-10)', async () => {
      renderWith(null)

      await userEvent.click(screen.getByRole('button', { name: SIGN_IN_LABEL }))

      // the trigger says the same words, so the dialog is found by its role
      expect(await screen.findByRole('dialog')).toHaveTextContent(SIGN_IN_TITLE)
      expect(screen.getByTestId('sign-in-github')).toBeInTheDocument()
      expect(screen.getByTestId('sign-in-google')).toBeInTheDocument()
      expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    })

    /** The dialog exists so `returnTo` is the page somebody was actually on. */
    it('sends the current path and query back as returnTo', async () => {
      renderWith(null)

      await userEvent.click(screen.getByRole('button', { name: SIGN_IN_LABEL }))

      const github = await screen.findByTestId('sign-in-github')
      expect(github).toHaveAttribute(
        'href',
        '/api/v1/auth/github?returnTo=%2Fprojects%2Fabc%3Ftab%3Dfeedback',
      )
    })
  })

  describe('signed in', () => {
    it('shows the account menu instead of the sign-in trigger', () => {
      renderWith(ADA)

      expect(screen.getByRole('navigation', { name: 'Account' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: SIGN_IN_LABEL })).not.toBeInTheDocument()
    })

    it('links to the profile and the settings page', () => {
      renderWith(ADA)

      expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveAttribute(
        'href',
        '/users/ada',
      )
      expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    })

    it('draws the initial when the provider gave no picture', () => {
      renderWith(ADA)

      expect(screen.getByRole('link', { name: /Ada Lovelace/ })).toHaveTextContent('A')
    })

    it('uses the provider picture when there is one', () => {
      renderWith({ ...ADA, avatarUrl: 'https://cdn.test/ada.png' })

      const image = document.querySelector('img')
      expect(image).toHaveAttribute('src', 'https://cdn.test/ada.png')
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
    })
  })

  describe('signing out', () => {
    it('posts to the api and forgets who was signed in', async () => {
      const { client } = renderWith(ADA)

      await userEvent.click(screen.getByRole('button', { name: SIGN_OUT_LABEL }))

      await waitFor(() => {
        expect(logout).toHaveBeenCalledWith('/api/v1/auth/logout')
      })
      await waitFor(() => {
        expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull()
      })
    })

    it('leaves the header showing the signed-out state', async () => {
      renderWith(ADA)

      await userEvent.click(screen.getByRole('button', { name: SIGN_OUT_LABEL }))

      expect(await screen.findByRole('button', { name: SIGN_IN_LABEL })).toBeInTheDocument()
    })
  })
})
