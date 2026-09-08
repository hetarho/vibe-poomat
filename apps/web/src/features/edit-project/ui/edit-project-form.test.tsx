import type { projects } from '@repo/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EDIT_PROJECT_SUBMIT, EditProjectForm, FROZEN_BY_MISSION } from './edit-project-form'

const patch = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ PATCH: patch, POST: vi.fn() }) }
})

const PROJECT = {
  id: '0192f000-0000-7000-8000-000000000001',
  owner: {
    id: '0192f000-0000-7000-8000-0000000000aa',
    handle: 'ada',
    displayName: 'Ada',
    avatarUrl: null,
  },
  title: 'Poomat',
  liveUrl: 'https://poomat.test',
  pitch: 'Feedback for people who ship.',
  description: null,
  coverUrl: null,
  tags: ['Tool'],
  upvoteCount: 0,
  activeMission: null,
  deletedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
} as projects.Project

const OPEN_MISSION = {
  id: '0192f000-0000-7000-8000-0000000000bb',
  slots: 3,
  openSlots: 2,
  expiresAt: '2026-10-01T00:00:00.000Z',
}

function renderForm(project: projects.Project = PROJECT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <EditProjectForm project={project} />
    </QueryClientProvider>,
  )
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`${EDIT_PROJECT_SUBMIT}|Saving`) })
}

describe('EditProjectForm (PROJ-7)', () => {
  beforeEach(() => {
    patch.mockReset()
    patch.mockResolvedValue({ data: PROJECT })
  })

  it('starts from what is stored, not from an empty form', () => {
    renderForm({ ...PROJECT, description: '# Notes' })

    expect(screen.getByLabelText('Title')).toHaveValue('Poomat')
    expect(screen.getByLabelText('Live URL')).toHaveValue('https://poomat.test')
    expect(screen.getByLabelText('Description')).toHaveValue('# Notes')
    expect(screen.getByRole('button', { name: 'Tool' })).toHaveAttribute('aria-pressed', 'true')
  })

  describe('with no mission open', () => {
    it('lets the title and the URL be edited', () => {
      renderForm()

      expect(screen.getByLabelText('Title')).toBeEnabled()
      expect(screen.getByLabelText('Live URL')).toBeEnabled()
    })

    it('sends the title and the URL along with everything else', async () => {
      renderForm()

      await userEvent.click(saveButton())

      await waitFor(() => {
        expect(patch).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/{id}', {
          params: { path: { id: PROJECT.id } },
          body: {
            title: 'Poomat',
            liveUrl: 'https://poomat.test',
            pitch: 'Feedback for people who ship.',
            description: null,
            tags: ['Tool'],
          },
        })
      })
    })
  })

  describe('while a mission is open', () => {
    const locked = { ...PROJECT, activeMission: OPEN_MISSION }

    it('disables the title and the URL', () => {
      renderForm(locked)

      expect(screen.getByLabelText('Title')).toBeDisabled()
      expect(screen.getByLabelText('Live URL')).toBeDisabled()
    })

    it('says why, rather than leaving somebody to guess', () => {
      renderForm(locked)

      expect(screen.getAllByText(FROZEN_BY_MISSION)).toHaveLength(2)
    })

    it('leaves the rest editable, as PROJ-7 says', () => {
      renderForm(locked)

      expect(screen.getByLabelText('Pitch')).toBeEnabled()
      expect(screen.getByLabelText('Description')).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Game' })).toBeEnabled()
    })

    /** An unchanged `liveUrl` would still make the server re-probe it (T022). */
    it('leaves the frozen fields out of the request entirely', async () => {
      renderForm(locked)
      await userEvent.type(screen.getByLabelText('Pitch'), ' Now with more.')

      await userEvent.click(saveButton())

      await waitFor(() => {
        expect(patch).toHaveBeenCalledTimes(1)
      })
      const body = patch.mock.calls[0]?.[1]?.body as Record<string, unknown>
      expect(body).not.toHaveProperty('title')
      expect(body).not.toHaveProperty('liveUrl')
      expect(body.pitch).toBe('Feedback for people who ship. Now with more.')
    })
  })
})
