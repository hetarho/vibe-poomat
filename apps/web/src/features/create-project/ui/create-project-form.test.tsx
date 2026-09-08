import { ApiError } from '@repo/api-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_TAGS,
  PITCH_MAX_LENGTH,
  PROJECT_TAGS,
  TITLE_MAX_LENGTH,
} from '../../../entities/project'
import { CREATE_PROJECT_SUBMIT, CreateProjectForm } from './create-project-form'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

function renderForm(onCreated = vi.fn()): typeof onCreated {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <CreateProjectForm onCreated={onCreated} />
    </QueryClientProvider>,
  )

  return onCreated
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`${CREATE_PROJECT_SUBMIT}|Checking`) })
}

async function fillValid(): Promise<void> {
  await userEvent.type(screen.getByLabelText('Title'), 'Poomat')
  await userEvent.type(screen.getByLabelText('Live URL'), 'https://poomat.test')
  await userEvent.type(screen.getByLabelText('Pitch'), 'Feedback for people who ship.')
  await userEvent.click(screen.getByRole('button', { name: 'Tool' }))
}

const CREATED = {
  id: '0192f000-0000-7000-8000-000000000001',
  title: 'Poomat',
}

describe('CreateProjectForm (PROJ-1)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: CREATED })
  })

  describe('the counters', () => {
    it('counts the title against its limit as it is typed', async () => {
      renderForm()

      await userEvent.type(screen.getByLabelText('Title'), 'abc')

      expect(screen.getByTestId('title-counter')).toHaveTextContent(`3 / ${TITLE_MAX_LENGTH}`)
    })

    it('counts the pitch against its own limit', async () => {
      renderForm()

      await userEvent.type(screen.getByLabelText('Pitch'), 'abcd')

      expect(screen.getByTestId('pitch-counter')).toHaveTextContent(`4 / ${PITCH_MAX_LENGTH}`)
    })
  })

  describe('the tag chips (PROJ-3)', () => {
    it('offers exactly the fixed list, and nothing outside it', () => {
      renderForm()

      const chips = screen
        .getAllByRole('button', { pressed: false })
        .map((chip) => chip.textContent)

      expect(chips).toEqual(expect.arrayContaining([...PROJECT_TAGS]))
      expect(screen.queryByRole('button', { name: 'Crypto' })).toBeNull()
    })

    it('stops at the cap: a further tag cannot be picked', async () => {
      renderForm()

      for (const tag of PROJECT_TAGS.slice(0, MAX_TAGS)) {
        await userEvent.click(screen.getByRole('button', { name: tag }))
      }

      expect(screen.getByRole('button', { name: PROJECT_TAGS[MAX_TAGS] })).toBeDisabled()
      expect(screen.getByRole('button', { name: PROJECT_TAGS[0] })).toBeEnabled()
    })

    it('frees a slot again when one is taken back', async () => {
      renderForm()
      for (const tag of PROJECT_TAGS.slice(0, MAX_TAGS)) {
        await userEvent.click(screen.getByRole('button', { name: tag }))
      }

      await userEvent.click(screen.getByRole('button', { name: PROJECT_TAGS[0] }))

      expect(screen.getByRole('button', { name: PROJECT_TAGS[MAX_TAGS] })).toBeEnabled()
    })
  })

  describe('what it refuses before asking the server', () => {
    it('starts blocked, because nothing has been filled in', () => {
      renderForm()

      expect(submitButton()).toBeDisabled()
    })

    it('is postable once every required field holds something', async () => {
      renderForm()

      await fillValid()

      expect(submitButton()).toBeEnabled()
    })

    it('sends nothing while the URL is not https', async () => {
      renderForm()
      await fillValid()
      await userEvent.clear(screen.getByLabelText('Live URL'))
      await userEvent.type(screen.getByLabelText('Live URL'), 'http://poomat.test')

      await userEvent.click(submitButton())

      expect(post).not.toHaveBeenCalled()
    })
  })

  describe('what it sends', () => {
    it('posts the trimmed fields, with an absent description as null', async () => {
      renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/projects', {
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

    it('hands the created project back to the caller (PROJ-12)', async () => {
      const onCreated = renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      // react-query hands its `onSuccess` the variables and context too
      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledTimes(1)
      })
      expect(onCreated.mock.calls[0]?.[0]).toEqual(CREATED)
    })
  })

  /**
   * PROJ-2 is answered by the server's probe, never from the browser: a CORS
   * failure here would say "unreachable" about a site that works.
   */
  describe('when the server could not open the URL', () => {
    beforeEach(() => {
      post.mockRejectedValue(
        new ApiError(422, {
          code: 'PROJECT_URL_UNREACHABLE',
          message: 'this url could not be opened',
          details: { url: 'https://poomat.test', status: 503 },
        }),
      )
    })

    it('says so on the URL field, with the status the server saw', async () => {
      renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      const problem = await screen.findByText(/answered 503/)
      expect(problem).toBeInTheDocument()
    })

    it('keeps every other value, so nothing has to be retyped', async () => {
      renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      await screen.findByText(/answered 503/)
      expect(screen.getByLabelText('Title')).toHaveValue('Poomat')
      expect(screen.getByLabelText('Pitch')).toHaveValue('Feedback for people who ship.')
      expect(screen.getByRole('button', { name: 'Tool' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByLabelText('Live URL')).toHaveValue('https://poomat.test')
    })

    it('marks the URL field invalid, so it is findable without reading', async () => {
      renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(screen.getByLabelText('Live URL')).toHaveAttribute('aria-invalid', 'true')
      })
    })
  })

  describe('while the server is opening the URL', () => {
    it('shows the submit button as pending, and says what is happening', async () => {
      let settle: (value: unknown) => void = () => undefined
      post.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve
        }),
      )
      renderForm()
      await fillValid()

      await userEvent.click(submitButton())

      expect(await screen.findByText(/opening your URL/)).toBeInTheDocument()
      expect(submitButton()).toBeDisabled()
      settle({ data: CREATED })
    })
  })

  describe('the description preview', () => {
    it('renders the markdown that was typed, sanitised by the one renderer', async () => {
      renderForm()
      await userEvent.type(
        screen.getByLabelText('Description'),
        '# Heading{enter}{enter}<script>alert(1)</script>',
      )

      await userEvent.click(screen.getByRole('button', { name: 'Preview' }))

      const preview = screen.getByLabelText('Description preview')
      expect(preview).toHaveTextContent('Heading')
      expect(preview.querySelector('script')).toBeNull()
      expect(preview.textContent).not.toContain('<script>')
    })
  })
})
