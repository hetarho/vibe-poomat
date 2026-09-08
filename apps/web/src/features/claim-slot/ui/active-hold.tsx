import type { feedback } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { errorMessage } from '../../../shared/api'
import { Button } from '../../../shared/ui'
import { useHoldCountdown } from '../model/use-hold-countdown'
import { useReleaseSlot } from '../model/use-release-slot'

export const WRITE_REPORT_LABEL = 'Write the report'
export const GIVE_UP_LABEL = 'Give up the slot'
export const LAPSED_NOTICE = 'Your hold ran out, so the slot went back for somebody else to take.'

type ActiveHoldProps = {
  claim: feedback.Claim
  projectId: string
  /** Whether anything is left to take again, if this hold has lapsed. */
  claimableSlots: number
}

/**
 * FDBK-1's 24 hours, while they are running. The countdown is derived from the
 * server's `held_until`; a hold this browser thinks has lapsed is rendered as
 * lapsed, and the server confirms it either way when something is submitted.
 */
export function ActiveHold({ claim, projectId, claimableSlots }: ActiveHoldProps) {
  const { text, lapsed } = useHoldCountdown(claim.heldUntil)
  const release = useReleaseSlot(claim.missionId, projectId)

  if (lapsed) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <p className="text-sm" data-testid="hold-lapsed">
          {LAPSED_NOTICE}
        </p>
        <p className="text-muted-foreground text-sm">
          {claimableSlots > 0
            ? 'There are still slots on this mission — take another one.'
            : 'Every slot is taken at the moment. Holds lapse, so it is worth looking again later.'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <p className="text-sm">
        <span className="font-medium">You are holding a slot.</span>{' '}
        <span className="text-muted-foreground" data-testid="hold-countdown">
          {text}
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to="/missions/$id/report" params={{ id: claim.missionId }}>
            {WRITE_REPORT_LABEL}
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={release.isPending}
          onClick={() => release.mutate(claim.id)}
        >
          {release.isPending ? 'Giving it back…' : GIVE_UP_LABEL}
        </Button>
      </div>
      {release.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(release.error)}
        </p>
      ) : null}
    </div>
  )
}
