import type { feedback, projects } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import {
  fieldLength,
  MIN_FIELD_LENGTH,
  REPORT_LABELS,
  reportProblems,
} from '../../../entities/feedback'
import { errorMessage, fieldErrors } from '../../../shared/api'
import { Button, Textarea } from '../../../shared/ui'
import { useReportDraft } from '../model/use-report-draft'
import { useSubmitFeedback } from '../model/use-submit-feedback'

export const SUBMIT_LABEL = 'Submit the report'
export const DRAFT_RESTORED = 'Picked up where you left off — this draft is saved in this browser.'

type ReportFormProps = {
  claim: feedback.Claim
  mission: projects.Mission
  projectId: string
  onSubmitted: (report: feedback.Feedback) => void
}

type FieldProps = {
  id: string
  label: string
  hint?: string
  value: string
  problem: string | null | undefined
  onChange: (value: string) => void
}

/** Every field is the same shape, and the counter is FDBK-10 made visible. */
function ReportField({ id, label, hint, value, problem, onChange }: FieldProps) {
  const length = fieldLength(value)

  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-sm" htmlFor={id}>
        {label}
      </label>
      {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
      <Textarea
        id={id}
        rows={4}
        value={value}
        aria-invalid={problem != null}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="text-muted-foreground text-xs" data-testid={`${id}-counter`}>
        {length} / {MIN_FIELD_LENGTH} minimum
      </p>
      {problem == null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {label}: {problem}
        </p>
      )}
    </div>
  )
}

/**
 * FDBK-3's fixed shape, all of it required, with FDBK-10's floor shown on every
 * field. There is no save button and no draft on the server: FDBK-4 makes the
 * submitted report the one artifact the maker judges, so the only thing kept is
 * a local draft this browser can lose without consequence.
 */
export function ReportForm({ claim, mission, projectId, onSubmitted }: ReportFormProps) {
  const questionCount = mission.questions.length
  const { draft, update, clear, restored } = useReportDraft(claim.id, questionCount)
  const submit = useSubmitFeedback(mission.id, projectId)
  const [attempted, setAttempted] = useState(false)

  const local = reportProblems(draft)
  const fromServer = fieldErrors(submit.error)
  const blocked = Object.keys(local).length > 0
  // shown once somebody has tried, so an untouched form is not a wall of red
  const problem = (field: string): string | null =>
    (attempted ? local[field] : undefined) ?? fromServer[field] ?? null

  function setAnswer(index: number, value: string): void {
    update({ answers: draft.answers.map((answer, at) => (at === index ? value : answer)) })
  }

  function send(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setAttempted(true)
    if (blocked || submit.isPending) return

    submit.mutate(
      {
        claimId: claim.id,
        report: {
          firstImpression: draft.firstImpression.trim(),
          stuckAt: draft.stuckAt.trim(),
          wouldPay: draft.wouldPay,
          wouldPayReason: draft.wouldPayReason.trim(),
          suggestion: draft.suggestion.trim(),
          answers: draft.answers.map((answer) => answer.trim()),
        },
      },
      {
        onSuccess: (report) => {
          // the draft has done its job; leaving it would restore it next visit
          clear()
          onSubmitted(report)
        },
      },
    )
  }

  return (
    <form onSubmit={send} className="flex flex-col gap-6" aria-label="Feedback report">
      {restored ? <p className="text-muted-foreground text-sm">{DRAFT_RESTORED}</p> : null}

      <ReportField
        id="firstImpression"
        label={REPORT_LABELS.firstImpression}
        hint="What did you think in the first thirty seconds?"
        value={draft.firstImpression}
        problem={problem('firstImpression')}
        onChange={(value) => update({ firstImpression: value })}
      />

      <ReportField
        id="stuckAt"
        label={REPORT_LABELS.stuckAt}
        hint="Where did it stop being obvious what to do?"
        value={draft.stuckAt}
        problem={problem('stuckAt')}
        onChange={(value) => update({ stuckAt: value })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium text-sm">Would you pay for this?</legend>
        <div className="flex gap-4 text-sm">
          {[true, false].map((choice) => (
            <label key={String(choice)} className="flex items-center gap-2">
              <input
                type="radio"
                name="wouldPay"
                value={String(choice)}
                checked={draft.wouldPay === choice}
                onChange={() => update({ wouldPay: choice })}
              />
              {choice ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
        <ReportField
          id="wouldPayReason"
          label={REPORT_LABELS.wouldPayReason}
          value={draft.wouldPayReason}
          problem={problem('wouldPayReason')}
          onChange={(value) => update({ wouldPayReason: value })}
        />
      </fieldset>

      <ReportField
        id="suggestion"
        label={REPORT_LABELS.suggestion}
        hint="One change you would make first."
        value={draft.suggestion}
        problem={problem('suggestion')}
        onChange={(value) => update({ suggestion: value })}
      />

      {questionCount === 0 ? null : (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-medium text-sm">What the maker asked</legend>
          {mission.questions.map((question, index) => (
            <ReportField
              key={question}
              id={`answers.${index}`}
              label={question}
              value={draft.answers[index] ?? ''}
              problem={problem(`answers.${index}`)}
              onChange={(value) => setAnswer(index, value)}
            />
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={(attempted && blocked) || submit.isPending}>
            {submit.isPending ? 'Submitting…' : SUBMIT_LABEL}
          </Button>
          <span className="text-muted-foreground text-sm">
            Once it is in, it cannot be changed.
          </span>
        </div>
        {attempted && blocked ? (
          <p role="alert" className="text-destructive text-sm">
            Every field needs at least {MIN_FIELD_LENGTH} characters before this can go.
          </p>
        ) : null}
        {submit.isError && Object.keys(fromServer).length === 0 ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(submit.error)}
          </p>
        ) : null}
      </div>
    </form>
  )
}
