import type { notifications } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALWAYS_ON_NOTE,
  NOTIFICATION_PREFERENCES_KEY,
} from '../../../entities/notification-preference'
import { NotificationToggles } from './notification-toggles'

const patch = vi.fn()
const get = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ PATCH: patch, GET: get }) }
})

const PREFERENCES: notifications.NotificationPreferences = {
  items: [
    { type: 'feedback_received', enabled: true, canDisable: true },
    { type: 'thread_reply', enabled: false, canDisable: true },
    { type: 'auto_accept_warning', enabled: true, canDisable: false },
  ],
}

function renderToggles(preferences = PREFERENCES): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // seeded the way the route's loader seeds it, and answered again if refetched
  client.setQueryData(NOTIFICATION_PREFERENCES_KEY, preferences)
  get.mockResolvedValue({ data: preferences })

  render(
    <QueryClientProvider client={client}>
      <NotificationToggles />
    </QueryClientProvider>,
  )

  return client
}

describe('NotificationToggles (NOTI-3)', () => {
  beforeEach(() => {
    patch.mockReset()
    get.mockReset()
    patch.mockResolvedValue({ data: PREFERENCES })
  })

  it('renders one toggle per type, in a sentence rather than a code', () => {
    renderToggles()

    expect(screen.getByLabelText(/left feedback on my project/)).toBeInTheDocument()
    expect(screen.queryByText('feedback_received')).not.toBeInTheDocument()
  })

  it('shows each one at the setting the server reported', () => {
    renderToggles()

    expect(screen.getByLabelText(/left feedback on my project/)).toBeChecked()
    expect(screen.getByLabelText(/replied in a thread/)).not.toBeChecked()
  })

  /** Hiding it would leave somebody hunting for a switch that is not there. */
  describe('the one that cannot be switched off', () => {
    it('is shown on and disabled rather than left out', () => {
      renderToggles()

      const warning = screen.getByLabelText(/decides itself in 24 hours/)
      expect(warning).toBeChecked()
      expect(warning).toBeDisabled()
    })

    it('says why', () => {
      renderToggles()

      expect(screen.getByText(ALWAYS_ON_NOTE)).toBeInTheDocument()
    })
  })

  describe('changing one', () => {
    it('sends only the type that changed', async () => {
      renderToggles()

      await userEvent.click(screen.getByLabelText(/left feedback on my project/))

      await waitFor(() => {
        expect(patch).toHaveBeenCalledExactlyOnceWith('/api/v1/notifications/preferences', {
          body: { feedback_received: false },
        })
      })
    })

    it('turns one back on the same way', async () => {
      renderToggles()

      await userEvent.click(screen.getByLabelText(/replied in a thread/))

      await waitFor(() => {
        expect(patch.mock.calls[0]?.[1]).toEqual({ body: { thread_reply: true } })
      })
    })

    /** The server's answer is the truth, so the page is set from it. */
    it('takes the whole set back from the answer rather than guessing', async () => {
      patch.mockResolvedValue({
        data: {
          items: [
            { type: 'feedback_received', enabled: false, canDisable: true },
            { type: 'thread_reply', enabled: false, canDisable: true },
            { type: 'auto_accept_warning', enabled: true, canDisable: false },
          ],
        },
      })
      const client = renderToggles()

      await userEvent.click(screen.getByLabelText(/left feedback on my project/))

      await waitFor(() => {
        expect(
          (
            client.getQueryData(
              NOTIFICATION_PREFERENCES_KEY,
            ) as notifications.NotificationPreferences
          ).items[0]?.enabled,
        ).toBe(false)
      })
    })

    /** A checkbox that settles only after a round trip reads as one that stuck. */
    it('moves the switch on the press, before the server has answered', async () => {
      let settle: (value: unknown) => void = () => undefined
      patch.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve
        }),
      )
      renderToggles()

      await userEvent.click(screen.getByLabelText(/left feedback on my project/))

      expect(screen.getByLabelText(/left feedback on my project/)).not.toBeChecked()
      settle({ data: PREFERENCES })
    })

    it('rolls the switch back and says so when the server refuses', async () => {
      patch.mockRejectedValue(new Error('nope'))
      renderToggles()

      await userEvent.click(screen.getByLabelText(/left feedback on my project/))

      expect(await screen.findByRole('alert')).toBeInTheDocument()
      expect(screen.getByLabelText(/left feedback on my project/)).toBeChecked()
    })

    it('leaves the other switches alone while one is in flight', async () => {
      patch.mockReturnValue(new Promise(() => undefined))
      renderToggles()

      await userEvent.click(screen.getByLabelText(/left feedback on my project/))

      expect(screen.getByLabelText(/replied in a thread/)).toBeEnabled()
    })
  })
})
