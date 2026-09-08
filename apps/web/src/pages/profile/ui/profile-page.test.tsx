import type { auth, feedback, projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRootRoute, createRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { NO_HISTORY_YET } from '../../../entities/user'
import { ProfilePage, UNKNOWN_HANDLE_HEADING } from './profile-page'

const ADA: auth.PublicProfile = {
  id: '0192a1b2-c3d4-7000-8000-0123456789ab',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  bio: 'Building the analytical engine.',
  link: 'https://ada.test',
  createdAt: '2026-03-04T00:00:00.000Z',
  credits: { balance: 3, received: 5, given: 2 },
  makerStats: {
    settledCount: 0,
    rejectedCount: 0,
    rejectionRate: null,
    reasons: { task_not_done: 0, no_substance: 0, spam_abuse: 0 },
  },
  email: undefined as never,
} as auth.PublicProfile

const EMPTY_PROJECTS: projects.FeedPage = { items: [], nextCursor: null }
const EMPTY_GIVEN: feedback.FeedbackPage = { items: [], nextCursor: null }

async function renderProfile(options: {
  profile?: auth.PublicProfile | null
  viewer?: { id: string } | null
  owned?: projects.FeedPage
  given?: feedback.FeedbackPage
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, options.viewer ?? null)

  // the page links to typed routes now, so it needs a router; one is enough
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => (
      <ProfilePage
        profile={options.profile === undefined ? ADA : options.profile}
        handle="ada"
        projects={options.owned ?? EMPTY_PROJECTS}
        given={options.given ?? EMPTY_GIVEN}
      />
    ),
  })
  const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) })

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router as never} />
    </QueryClientProvider>,
  )

  // the router mounts asynchronously; nothing is on screen until it has
  await screen.findByRole('heading', { level: 1 })
}

describe('ProfilePage (AUTH-3)', () => {
  describe('what it shows about the account', () => {
    it('renders the name, handle, bio, link and joining month', async () => {
      await renderProfile({})

      expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
      expect(screen.getByText('@ada')).toBeInTheDocument()
      expect(screen.getByText(ADA.bio as string)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'https://ada.test' })).toHaveAttribute(
        'href',
        'https://ada.test',
      )
      expect(screen.getByText(/March 2026/)).toBeInTheDocument()
    })

    it('renders CRED-7’s three public counters', async () => {
      await renderProfile({})

      const credits = screen.getByRole('region', { name: 'Credits' })
      expect(credits).toHaveTextContent('Balance')
      expect(credits).toHaveTextContent('3')
      expect(credits).toHaveTextContent('5')
      expect(credits).toHaveTextContent('2')
    })

    /** AUTH-4: the provider address is for notifications, never for display. */
    it('never renders an email address', async () => {
      await renderProfile({ profile: { ...ADA, email: 'ada@example.com' } as auth.PublicProfile })

      expect(screen.queryByText(/ada@example\.com/)).not.toBeInTheDocument()
    })

    it('leaves out a bio and a link that are not there', async () => {
      await renderProfile({ profile: { ...ADA, bio: null, link: null } })

      expect(screen.queryByText(ADA.bio as string)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'https://ada.test' })).not.toBeInTheDocument()
    })
  })

  describe('the rejection stats (FDBK-8)', () => {
    it('says "no history yet" rather than a spotless 0%', async () => {
      await renderProfile({})

      expect(screen.getByRole('region', { name: 'Rejection rate' })).toHaveTextContent(
        NO_HISTORY_YET,
      )
      expect(screen.queryByText(/0%/)).not.toBeInTheDocument()
    })

    it('renders the rate and every reason once there is history', async () => {
      await renderProfile({
        profile: {
          ...ADA,
          makerStats: {
            settledCount: 4,
            rejectedCount: 1,
            rejectionRate: 0.25,
            reasons: { task_not_done: 1, no_substance: 0, spam_abuse: 0 },
          },
        },
      })

      const stats = screen.getByRole('region', { name: 'Rejection rate' })
      expect(stats).toHaveTextContent('25%')
      expect(stats).toHaveTextContent('1 of 4 settled')
      expect(stats).toHaveTextContent('Task not done')
      expect(stats).toHaveTextContent('Spam or abuse')
      expect(stats).not.toHaveTextContent(NO_HISTORY_YET)
    })
  })

  describe('the two lists', () => {
    it('renders the account’s projects', async () => {
      await renderProfile({
        owned: {
          items: [{ id: 'p1', title: 'Poomat', pitch: 'Trade real feedback' }] as never,
          nextCursor: null,
        },
      })

      const projectList = screen.getByRole('region', { name: 'Projects' })
      expect(projectList).toHaveTextContent('Poomat')
      expect(screen.getByRole('link', { name: 'Poomat' })).toHaveAttribute('href', '/projects/p1')
    })

    it('renders the feedback the account has given', async () => {
      await renderProfile({
        given: {
          items: [{ id: 'f1', firstImpression: 'The sign-up worked', state: 'accepted' }] as never,
          nextCursor: null,
        },
      })

      expect(screen.getByRole('region', { name: 'Feedback given' })).toHaveTextContent('accepted')
      expect(screen.getByRole('link', { name: /The sign-up worked/ })).toHaveAttribute(
        'href',
        '/feedbacks/f1',
      )
    })

    it('says so plainly when there is nothing in either', async () => {
      await renderProfile({})

      expect(screen.getByRole('region', { name: 'Projects' })).toHaveTextContent(
        'Nothing posted yet',
      )
      expect(screen.getByRole('region', { name: 'Feedback given' })).toHaveTextContent(
        'Nothing given yet',
      )
    })
  })

  describe('who is looking', () => {
    it('offers the owner a way to edit', async () => {
      await renderProfile({ viewer: { id: ADA.id } })

      expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
        'href',
        '/settings',
      )
    })

    it('offers a visitor nothing to edit', async () => {
      await renderProfile({ viewer: { id: 'somebody-else' } })

      expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    })

    it('offers a signed-out visitor nothing to edit either', async () => {
      await renderProfile({ viewer: null })

      expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
    })
  })

  describe('a handle nobody holds (AUTH-6)', () => {
    it('renders its own not-found rather than an empty profile', async () => {
      await renderProfile({ profile: null })

      expect(screen.getByRole('heading', { name: UNKNOWN_HANDLE_HEADING })).toBeInTheDocument()
      expect(screen.getByText('@ada')).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Credits' })).not.toBeInTheDocument()
    })

    it('explains that a released handle is why an old link can lead here', async () => {
      await renderProfile({ profile: null })

      expect(screen.getByText(/released the moment they are changed/)).toBeInTheDocument()
    })
  })
})
