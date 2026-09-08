import type { feedback } from '@repo/contracts'
import { useState } from 'react'
import { ApiError, errorMessage } from '../../../shared/api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
} from '../../../shared/ui'
import {
  ACCEPT_CONSEQUENCE,
  REJECT_CONSEQUENCE,
  REJECTION_REASON_OPTIONS,
} from '../lib/consequences'
import { useSettleFeedback } from '../model/use-settle-feedback'

export const ACCEPT_LABEL = 'Accept'
export const REJECT_LABEL = 'Reject'
export const ALREADY_SETTLED_NOTICE =
  'This one was already settled — by you elsewhere, or by the 72-hour clock. The decision above is what stands.'
export const NOTE_MAX_LENGTH = 1000

type SettleControlsProps = {
  report: feedback.Feedback
}

/**
 * FDBK-6, for the maker of a report that is still pending. Both decisions state
 * what happens to the credit before they are confirmed (CRED-4), and the
 * rejection says outright that the report stays public with its reason — a
 * maker should not be surprised by their own rejection rate (FDBK-8, FDBK-9).
 */
export function SettleControls({ report }: SettleControlsProps) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState<feedback.RejectionReason | null>(null)
  const [note, setNote] = useState('')
  const settle = useSettleFeedback(report)

  const alreadySettled =
    settle.error instanceof ApiError && settle.error.code === 'FEEDBACK_ALREADY_SETTLED'

  return (
    <section
      aria-label="Your decision"
      className="flex flex-col gap-3 rounded-md border border-border p-4"
    >
      <h2 className="font-medium text-sm">Your decision</h2>
      <p className="text-muted-foreground text-sm">{ACCEPT_CONSEQUENCE}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={settle.isPending}
          onClick={() => settle.mutate({ kind: 'accept' })}
        >
          {settle.isPending ? 'Deciding…' : ACCEPT_LABEL}
        </Button>

        <Dialog open={rejecting} onOpenChange={setRejecting}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" disabled={settle.isPending}>
              {REJECT_LABEL}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reject this report?</DialogTitle>
              <DialogDescription>{REJECT_CONSEQUENCE}</DialogDescription>
            </DialogHeader>

            <fieldset className="flex flex-col gap-2">
              <legend className="font-medium text-sm">Why</legend>
              {REJECTION_REASON_OPTIONS.map((option) => (
                <label key={option.value} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    className="mt-1"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                  />
                  <span>
                    {option.label}
                    <span className="block text-muted-foreground text-xs">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="flex flex-col gap-1">
              <label className="font-medium text-sm" htmlFor="rejection-note">
                Anything to add <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="rejection-note"
                rows={3}
                value={note}
                maxLength={NOTE_MAX_LENGTH}
                onChange={(event) => setNote(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                The feedbacker reads this, and so does everybody else.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={reason === null || settle.isPending}
                onClick={() =>
                  reason === null
                    ? undefined
                    : settle.mutate(
                        { kind: 'reject', reason, note: note.trim() === '' ? null : note.trim() },
                        { onSuccess: () => setRejecting(false) },
                      )
                }
              >
                {settle.isPending ? 'Rejecting…' : REJECT_LABEL}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {settle.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {alreadySettled ? ALREADY_SETTLED_NOTICE : errorMessage(settle.error)}
        </p>
      ) : null}
    </section>
  )
}
