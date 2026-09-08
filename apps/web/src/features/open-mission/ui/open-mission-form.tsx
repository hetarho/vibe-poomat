import type { projects } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import {
  askedQuestions,
  balanceProblem,
  escrowCost,
  MAX_QUESTIONS,
  MAX_SLOTS,
  MIN_SLOTS,
  QUESTION_MAX_LENGTH,
  questionProblem,
  questionsProblem,
  slotsProblem,
  TASK_TEXT_MAX_LENGTH,
  taskTextProblem,
  textLength,
} from '../../../entities/mission'
import { ApiError, errorMessage } from '../../../shared/api'
import { Button, Input, Textarea } from '../../../shared/ui'
import { useOpenMission } from '../model/use-open-mission'

export const OPEN_MISSION_SUBMIT = 'Open the mission'
export const ALREADY_OPEN =
  'A mission is already open on this project. One at a time, so the feedback that is coming is not spread thin.'

type OpenMissionFormProps = {
  projectId: string
  /** CRED-3's cost is checked against this; it may be stale, and that is fine. */
  balance: number
  onOpened: (mission: projects.Mission) => void
}

export function OpenMissionForm({ projectId, balance, onOpened }: OpenMissionFormProps) {
  const [taskText, setTaskText] = useState('')
  const [questions, setQuestions] = useState<string[]>([''])
  const [slots, setSlots] = useState(MIN_SLOTS)
  const open = useOpenMission(projectId)

  const cost = escrowCost(slots)
  const local = {
    taskText: taskTextProblem(taskText),
    questions: questionsProblem(questions),
    slots: slotsProblem(slots),
    balance: balanceProblem(slots, balance),
  }
  const blocked = Object.values(local).some((value) => value !== null)

  /**
   * The server is the authority on CRED-3 (T023): this balance can be stale, so
   * whatever it says is rendered even when the check above passed.
   */
  const fromServer =
    open.error instanceof ApiError && open.error.code === 'CREDIT_INSUFFICIENT'
      ? `The server refused: there are not ${cost} credits to escrow. Give feedback to earn more, or ask for fewer slots.`
      : null

  function setQuestion(index: number, value: string): void {
    setQuestions((rows) => rows.map((row, at) => (at === index ? value : row)))
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (blocked || open.isPending) return

    const asked = askedQuestions(questions)
    open.mutate(
      {
        taskText: taskText.trim(),
        slots,
        ...(asked.length === 0 ? {} : { questions: asked }),
      },
      { onSuccess: onOpened },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label="Open a mission">
      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor="taskText">
          What should a feedbacker try?
        </label>
        <Textarea
          id="taskText"
          rows={4}
          value={taskText}
          aria-invalid={local.taskText !== null}
          onChange={(event) => setTaskText(event.target.value)}
        />
        <p className="text-muted-foreground text-xs" data-testid="task-counter">
          {textLength(taskText)} / {TASK_TEXT_MAX_LENGTH}
        </p>
        {local.taskText === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {local.taskText}
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium text-sm">
          Questions <span className="text-muted-foreground">(optional, up to {MAX_QUESTIONS})</span>
        </legend>
        {questions.map((question, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the row is the identity
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Question ${index + 1}`}
                value={question}
                aria-invalid={questionProblem(question) !== null}
                onChange={(event) => setQuestion(index, event.target.value)}
              />
              {questions.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuestions((rows) => rows.filter((_row, at) => at !== index))}
                >
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-xs">
              {textLength(question)} / {QUESTION_MAX_LENGTH}
            </p>
          </div>
        ))}
        {questions.length < MAX_QUESTIONS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setQuestions((rows) => [...rows, ''])}
          >
            Add a question
          </Button>
        ) : null}
        {local.questions === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {local.questions}
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label className="font-medium text-sm" htmlFor="slots">
          Slots
        </label>
        <Input
          id="slots"
          type="number"
          min={MIN_SLOTS}
          max={MAX_SLOTS}
          value={slots}
          aria-invalid={local.slots !== null}
          className="w-24"
          onChange={(event) => setSlots(Number(event.target.value))}
        />
        <p className="text-sm" data-testid="cost-preview">
          Costs <span className="font-medium">{cost}</span> {cost === 1 ? 'credit' : 'credits'},
          escrowed until each slot settles. You have <span className="font-medium">{balance}</span>.
        </p>
        {local.slots === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {local.slots}
          </p>
        )}
        {local.balance === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {local.balance}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={blocked || open.isPending}>
            {open.isPending ? 'Opening…' : OPEN_MISSION_SUBMIT}
          </Button>
          <span className="text-muted-foreground text-sm">
            The task and the questions are frozen once it opens.
          </span>
        </div>
        {fromServer === null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {fromServer}
          </p>
        )}
        {open.isError && fromServer === null ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(open.error)}
          </p>
        ) : null}
      </div>
    </form>
  )
}
