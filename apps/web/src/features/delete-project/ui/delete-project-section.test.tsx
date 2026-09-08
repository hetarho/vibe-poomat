import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BLOCKED_BY_MISSION, PROJECT_DELETION_CONSEQUENCES } from '../lib/consequences'
import { DELETE_PROJECT_HEADING, DeleteProjectSection } from './delete-project-section'

const remove = vi.fn(async () => ({ data: undefined }))

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ DELETE: remove }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'

function renderSection(missionIsOpen: boolean, onDeleted = vi.fn()): typeof onDeleted {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <DeleteProjectSection
        projectId={PROJECT_ID}
        title="Poomat"
        missionIsOpen={missionIsOpen}
        onDeleted={onDeleted}
      />
    </QueryClientProvider>,
  )

  return onDeleted
}

function deleteTrigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Delete project' })
}

describe('DeleteProjectSection (PROJ-8)', () => {
  beforeEach(() => {
    remove.mockClear()
  })

  describe('while a mission is open', () => {
    it('offers the action as unavailable rather than hiding it', () => {
      renderSection(true)

      expect(deleteTrigger()).toBeDisabled()
    })

    it('says why, and what to do about it', () => {
      renderSection(true)

      expect(screen.getByRole('region', { name: DELETE_PROJECT_HEADING })).toHaveTextContent(
        BLOCKED_BY_MISSION,
      )
    })

    it('calls nothing, however hard the button is clicked', async () => {
      renderSection(true)

      await userEvent.click(deleteTrigger())

      expect(remove).not.toHaveBeenCalled()
    })
  })

  describe('with no mission open', () => {
    it('asks first, and states what deleting actually does', async () => {
      renderSection(false)

      await userEvent.click(deleteTrigger())

      const dialog = await screen.findByRole('dialog')
      for (const line of PROJECT_DELETION_CONSEQUENCES) {
        expect(dialog).toHaveTextContent(line)
      }
    })

    it('says the received feedback stays, so nobody expects it to vanish', async () => {
      renderSection(false)

      await userEvent.click(deleteTrigger())

      expect(await screen.findByRole('dialog')).toHaveTextContent(
        /feedback you received stays, visible to you/i,
      )
    })

    it('does nothing at all if the confirmation is declined', async () => {
      renderSection(false)
      await userEvent.click(deleteTrigger())

      await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }))

      expect(remove).not.toHaveBeenCalled()
    })

    it('calls the endpoint once, and hands control back', async () => {
      const onDeleted = renderSection(false)
      await userEvent.click(deleteTrigger())
      const dialog = await screen.findByRole('dialog')

      await userEvent.click(await within(dialog).findByRole('button', { name: 'Delete project' }))

      await waitFor(() => {
        expect(remove).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/{id}', {
          params: { path: { id: PROJECT_ID } },
        })
      })
      expect(onDeleted).toHaveBeenCalledTimes(1)
    })
  })
})
