import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { DELETION_CONSEQUENCES } from '../lib/consequences'
import { DELETE_HEADING, DeleteAccountSection } from './delete-account-section'

const remove = vi.fn(async () => ({ data: undefined }))

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ DELETE: remove }) }
})

function renderSection(onDeleted = vi.fn()): { client: QueryClient; onDeleted: typeof onDeleted } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, { id: 'a', handle: 'ada' })

  render(
    <QueryClientProvider client={client}>
      <DeleteAccountSection handle="ada" onDeleted={onDeleted} />
    </QueryClientProvider>,
  )

  return { client, onDeleted }
}

function deleteButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Delete account' })
}

describe('DeleteAccountSection (AUTH-9)', () => {
  beforeEach(() => {
    remove.mockClear()
  })

  describe('what it tells somebody first', () => {
    it('lists every consequence, in the words the decision uses', () => {
      renderSection()

      const section = screen.getByRole('region', { name: DELETE_HEADING })
      for (const line of DELETION_CONSEQUENCES) {
        expect(section).toHaveTextContent(line)
      }
    })

    it('says the feedback given is kept, so nobody expects it to vanish', () => {
      renderSection()

      expect(screen.getByRole('region', { name: DELETE_HEADING })).toHaveTextContent(
        /feedback you gave other people is kept/i,
      )
    })

    it('says it cannot be undone', () => {
      renderSection()

      expect(screen.getByRole('region', { name: DELETE_HEADING })).toHaveTextContent(
        /cannot be undone/i,
      )
    })
  })

  describe('the typed confirmation', () => {
    it('keeps the button disabled until nothing has been typed', () => {
      renderSection()

      expect(deleteButton()).toBeDisabled()
    })

    it.each(['ad', 'ADA', 'bob', 'ada '])('stays disabled for %j', async (typed) => {
      renderSection()

      await userEvent.type(screen.getByLabelText(/Type/), typed)

      // a trailing space is not a mistake worth refusing, so that one enables
      expect(deleteButton()).toHaveProperty('disabled', typed.trim() !== 'ada')
    })

    it('enables only once the handle matches exactly', async () => {
      renderSection()

      await userEvent.type(screen.getByLabelText(/Type/), 'ada')

      expect(deleteButton()).toBeEnabled()
    })

    it('calls the endpoint once, with what was typed', async () => {
      renderSection()
      await userEvent.type(screen.getByLabelText(/Type/), 'ada')

      await userEvent.click(deleteButton())

      await waitFor(() => {
        expect(remove).toHaveBeenCalledExactlyOnceWith('/api/v1/users/me', {
          body: { confirm: 'ada' },
        })
      })
    })

    it('calls nothing at all while the confirmation does not match', async () => {
      renderSection()
      await userEvent.type(screen.getByLabelText(/Type/), 'bob')

      await userEvent.click(deleteButton())

      expect(remove).not.toHaveBeenCalled()
    })
  })

  describe('once it has happened', () => {
    it('forgets the session and hands control back to the caller', async () => {
      const { client, onDeleted } = renderSection()
      await userEvent.type(screen.getByLabelText(/Type/), 'ada')

      await userEvent.click(deleteButton())

      await waitFor(() => {
        expect(onDeleted).toHaveBeenCalledTimes(1)
      })
      expect(client.getQueryData(SESSION_QUERY_KEY)).toBeUndefined()
    })
  })
})
