import type { projects } from '@repo/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { myClaimQueryOptions } from '../../../entities/feedback'
import { Button } from '../../../shared/ui'
import { claimRefusal } from '../lib/claim-refusals'
import { useClaimSlot } from '../model/use-claim-slot'
import { ActiveHold } from './active-hold'
import { StartControl } from './start-control'

export const NO_SLOTS_LEFT =
  'Every slot on this mission is taken right now. Holds lapse after a day, so it is worth looking again.'
export const REPORT_IS_IN =
  'Your report is in. The maker has 72 hours to accept or reject it, after which it is accepted automatically.'
export const ALREADY_SETTLED = 'This one is settled. Thanks for the feedback.'

type ClaimSlotBlockProps = {
  mission: projects.Mission
  projectId: string
}

/**
 * FDBK-1 and FDBK-2 for a signed-in reader who is not the owner: whether to
 * offer a slot, show the hold that is already running, or say that the report
 * has been turned in. The owner never renders this — PROJ-12's owner is the one
 * person FDBK-2 rules out, and that is the caller's call to make.
 */
export function ClaimSlotBlock({ mission, projectId }: ClaimSlotBlockProps) {
  const mine = useQuery(myClaimQueryOptions(mission.id))
  const claim = useClaimSlot(mission.id, projectId)
  const held = mine.data ?? null

  if (mine.isPending) {
    return <p className="text-muted-foreground text-sm">Checking whether you hold a slot…</p>
  }

  if (held !== null && held.state === 'held') {
    return (
      <ActiveHold claim={held} projectId={projectId} claimableSlots={mission.occupancy.claimable} />
    )
  }

  if (held !== null && held.state === 'submitted') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-4">
        <p className="text-sm">{REPORT_IS_IN}</p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/missions/$id/report" params={{ id: mission.id }}>
            See what you wrote
          </Link>
        </Button>
      </div>
    )
  }

  if (held !== null && held.state === 'settled') {
    return <p className="text-muted-foreground text-sm">{ALREADY_SETTLED}</p>
  }

  if (mission.occupancy.claimable === 0) {
    return <p className="text-muted-foreground text-sm">{NO_SLOTS_LEFT}</p>
  }

  return (
    <div className="flex flex-col gap-2">
      <StartControl disabled={claim.isPending} onClick={() => claim.mutate()} />
      <p className="text-muted-foreground text-sm">
        A slot is yours for 24 hours. Use the thing, do the task, write the report.
      </p>
      {claim.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {claimRefusal(claim.error)}
        </p>
      ) : null}
    </div>
  )
}
