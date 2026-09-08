import { ApiError } from '@repo/api-client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_QUESTIONS, MAX_SLOTS, TASK_TEXT_MAX_LENGTH } from '../../../entities/mission'
import { OPEN_MISSION_SUBMIT, OpenMissionForm } from './open-mission-form'

const post = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: async () => ({ POST: post }) }
})

const PROJECT_ID = '0192f000-0000-7000-8000-000000000001'
const TASK = 'Try signing up and tell me where it went wrong.'

function renderForm(balance = 5, onOpened = vi.fn()): typeof onOpened {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <OpenMissionForm projectId={PROJECT_ID} balance={balance} onOpened={onOpened} />
    </QueryClientProvider>,
  )

  return onOpened
}

function submitButton(): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`${OPEN_MISSION_SUBMIT}|Opening`) })
}

function taskField(): HTMLElement {
  return screen.getByLabelText('What should a feedbacker try?')
}

function slotsField(): HTMLElement {
  return screen.getByLabelText('Slots')
}

async function setSlots(slots: number): Promise<void> {
  await userEvent.clear(slotsField())
  await userEvent.type(slotsField(), String(slots))
}

describe('OpenMissionForm (PROJ-4, PROJ-13, CRED-3)', () => {
  beforeEach(() => {
    post.mockReset()
    post.mockResolvedValue({ data: { id: 'm-1' } })
  })

  describe('the limits (PROJ-13)', () => {
    it('counts the task against its limit as it is typed', async () => {
      renderForm()

      await userEvent.type(taskField(), 'abc')

      expect(screen.getByTestId('task-counter')).toHaveTextContent(`3 / ${TASK_TEXT_MAX_LENGTH}`)
    })

    it('starts blocked, because there is no task yet', () => {
      renderForm()

      expect(submitButton()).toBeDisabled()
    })

    it('blocks a slot count past the maximum', async () => {
      renderForm(50)
      await userEvent.type(taskField(), TASK)

      await setSlots(MAX_SLOTS + 1)

      expect(submitButton()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent(`and ${MAX_SLOTS} slots`)
    })

    it('blocks an emptied slot count rather than sending nothing', async () => {
      renderForm()
      await userEvent.type(taskField(), TASK)

      await userEvent.clear(slotsField())

      expect(submitButton()).toBeDisabled()
    })

    it('offers no more than three question rows', async () => {
      renderForm()

      for (let added = 1; added < MAX_QUESTIONS; added += 1) {
        await userEvent.click(screen.getByRole('button', { name: 'Add a question' }))
      }

      expect(screen.getAllByLabelText(/^Question /)).toHaveLength(MAX_QUESTIONS)
      expect(screen.queryByRole('button', { name: 'Add a question' })).toBeNull()
    })

    it('lets a question row be taken away again', async () => {
      renderForm()
      await userEvent.click(screen.getByRole('button', { name: 'Add a question' }))

      await userEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0] as HTMLElement)

      expect(screen.getAllByLabelText(/^Question /)).toHaveLength(1)
    })
  })

  describe('the cost preview (CRED-3)', () => {
    it('matches the slot count and shows the balance beside it', async () => {
      renderForm(5)
      await userEvent.type(taskField(), TASK)

      await setSlots(4)

      expect(screen.getByTestId('cost-preview')).toHaveTextContent('Costs 4 credits')
      expect(screen.getByTestId('cost-preview')).toHaveTextContent('You have 5')
    })

    it('follows the slot count as it changes', async () => {
      renderForm(9)
      await userEvent.type(taskField(), TASK)

      await setSlots(7)

      expect(screen.getByTestId('cost-preview')).toHaveTextContent('Costs 7 credits')
    })

    it('disables submit with the reason when the balance is short', async () => {
      renderForm(2)
      await userEvent.type(taskField(), TASK)

      await setSlots(3)

      expect(submitButton()).toBeDisabled()
      expect(screen.getByRole('alert')).toHaveTextContent('That costs 3 credits and you have 2')
    })

    it('sends nothing at all while the balance is short', async () => {
      renderForm(1)
      await userEvent.type(taskField(), TASK)
      await setSlots(5)

      await userEvent.click(submitButton())

      expect(post).not.toHaveBeenCalled()
    })
  })

  describe('what it sends', () => {
    it('posts the task and the slots, leaving empty question rows out', async () => {
      renderForm()
      await userEvent.type(taskField(), TASK)
      await setSlots(2)

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(post).toHaveBeenCalledExactlyOnceWith('/api/v1/projects/{projectId}/missions', {
          params: { path: { projectId: PROJECT_ID } },
          body: { taskText: TASK, slots: 2 },
        })
      })
    })

    it('sends the questions somebody actually filled in', async () => {
      renderForm()
      await userEvent.type(taskField(), TASK)
      await userEvent.type(screen.getByLabelText('Question 1'), 'Was the first screen clear?')

      await userEvent.click(submitButton())

      await waitFor(() => {
        expect(post.mock.calls[0]?.[1]?.body).toMatchObject({
          questions: ['Was the first screen clear?'],
        })
      })
    })
  })

  /**
   * The balance this form checks against can be stale, so the server's refusal
   * has to reach the screen even when the local check passed (T023).
   */
  describe('when the server refuses for credits anyway', () => {
    it('renders the refusal rather than swallowing it', async () => {
      post.mockRejectedValue(
        new ApiError(409, { code: 'CREDIT_INSUFFICIENT', message: 'not enough credits' }),
      )
      renderForm(10)
      await userEvent.type(taskField(), TASK)
      await setSlots(2)

      await userEvent.click(submitButton())

      expect(await screen.findByText(/The server refused/)).toHaveTextContent(
        'not 2 credits to escrow',
      )
    })
  })
})
