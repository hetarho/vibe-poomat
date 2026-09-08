import { ApiError } from '@repo/api-client'
import type { auth } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BIO_MAX_LENGTH } from '../lib/profile-rules'
import { ProfileForm } from './profile-form'

const patch: ReturnType<typeof vi.fn> = vi.fn()
const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ PATCH: patch, POST: post }) }
})

const ADA = {
  id: 'a',
  handle: 'ada',
  displayName: 'Ada Lovelace',
  avatarUrl: null,
  bio: null,
  link: null,
  createdAt: '2026-03-04T00:00:00.000Z',
  credits: { balance: 0, received: 0, given: 0 },
  makerStats: {
    settledCount: 0,
    rejectedCount: 0,
    rejectionRate: null,
    reasons: { task_not_done: 0, no_substance: 0, spam_abuse: 0 },
  },
  email: 'ada@example.com',
  providers: ['github'],
} as auth.Me

function renderForm(profile: auth.Me = ADA) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <ProfileForm profile={profile} />
    </QueryClientProvider>,
  )
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: /Save profile|Saving/ })
}

describe('ProfileForm (AUTH-3)', () => {
  beforeEach(() => {
    patch.mockClear()
    patch.mockResolvedValue({ data: { ...ADA, displayName: 'Ada L' } })
  })

  describe('the bio counter', () => {
    it('starts where the stored bio does', () => {
      renderForm({ ...ADA, bio: 'hello' })

      expect(screen.getByTestId('bio-counter')).toHaveTextContent(`5 / ${BIO_MAX_LENGTH}`)
    })

    it('follows what is typed, character by character', async () => {
      renderForm()

      await userEvent.type(screen.getByLabelText('Bio'), 'abc')

      expect(screen.getByTestId('bio-counter')).toHaveTextContent(`3 / ${BIO_MAX_LENGTH}`)
    })
  })

  describe('what it refuses before asking the server', () => {
    it('blocks a bio one character past the limit', async () => {
      renderForm({ ...ADA, bio: 'a'.repeat(BIO_MAX_LENGTH + 1) })

      expect(saveButton()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent(`at most ${BIO_MAX_LENGTH}`)
    })

    it('blocks a link that is not https', async () => {
      renderForm()

      await userEvent.type(screen.getByLabelText('Link'), 'http://ada.test')

      expect(saveButton()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('https://')
    })

    it('blocks an empty display name', async () => {
      renderForm()

      await userEvent.clear(screen.getByLabelText('Display name'))

      expect(saveButton()).toBeDisabled()
    })

    it('sends nothing while anything is blocked', async () => {
      renderForm()
      await userEvent.type(screen.getByLabelText('Link'), 'nonsense')

      await userEvent.click(saveButton())

      expect(patch).not.toHaveBeenCalled()
    })
  })

  describe('what it sends', () => {
    it('trims the name and clears an emptied field with null', async () => {
      renderForm({ ...ADA, bio: 'something' })
      await userEvent.clear(screen.getByLabelText('Bio'))
      await userEvent.type(screen.getByLabelText('Display name'), '  ')

      await userEvent.click(saveButton())

      await waitFor(() => {
        expect(patch).toHaveBeenCalledWith('/api/v1/users/me', {
          body: { displayName: 'Ada Lovelace', bio: null, link: null },
        })
      })
    })

    /** A key only goes when an upload actually produced one. */
    it('sends no avatar key when nothing was uploaded', async () => {
      renderForm()

      await userEvent.click(saveButton())

      await waitFor(() => {
        expect(patch.mock.calls[0]?.[1] as object).not.toHaveProperty('body.avatarKey')
      })
    })
  })

  /** T006 puts a `details` map on a validation failure; it belongs on the field. */
  describe('what the server says about a field', () => {
    it('renders the server’s message beside the field it names', async () => {
      patch.mockRejectedValue(
        new ApiError(422, {
          code: 'VALIDATION_FAILED',
          message: 'not valid',
          details: { link: ['must be an https URL'] },
        }),
      )
      renderForm()

      await userEvent.click(saveButton())

      expect(await screen.findByText('must be an https URL')).toBeInTheDocument()
    })

    it('marks that field invalid, so it is findable without reading', async () => {
      patch.mockRejectedValue(
        new ApiError(422, {
          code: 'VALIDATION_FAILED',
          message: 'not valid',
          details: { displayName: ['is required'] },
        }),
      )
      renderForm()

      await userEvent.click(saveButton())

      await waitFor(() => {
        expect(screen.getByLabelText('Display name')).toHaveAttribute('aria-invalid', 'true')
      })
    })
  })
})
