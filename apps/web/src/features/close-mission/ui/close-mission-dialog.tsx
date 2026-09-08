import type { projects } from '@repo/contracts'
import { useState } from 'react'
import { errorMessage } from '../../../shared/api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../shared/ui'
import { useCloseMission } from '../model/use-close-mission'

export const CLOSE_MISSION_LABEL = 'Close the mission'

/** CRED-5 and PROJ-6, in the words the server actually acts on. */
export const REFUND_RULE = 'The slots nobody took are refunded to your balance right away.'
export const HELD_RULE =
  'A slot somebody is already working on stays open until they submit or their hold runs out — that credit stays escrowed until then.'

type CloseMissionDialogProps = {
  projectId: string
  mission: projects.Mission
}

/**
 * PROJ-6's early close. The confirmation states both halves of CRED-5, because
 * "closed" does not mean every credit comes back: whoever is mid-report keeps
 * their slot, and the maker still owes that one.
 */
export function CloseMissionDialog({ projectId, mission }: CloseMissionDialogProps) {
  const [open, setOpen] = useState(false)
  const close = useCloseMission(projectId)
  const inFlight = mission.occupancy.held + mission.occupancy.submitted

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {CLOSE_MISSION_LABEL}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{CLOSE_MISSION_LABEL}?</DialogTitle>
          <DialogDescription>This is what happens to the credits.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc pl-5 text-sm">
          <li>
            {REFUND_RULE}{' '}
            <span className="text-muted-foreground">
              That is {mission.occupancy.claimable} of {mission.slots} right now.
            </span>
          </li>
          <li>{HELD_RULE}</li>
        </ul>
        {inFlight === 0 ? null : (
          <p className="text-muted-foreground text-sm">
            {inFlight} {inFlight === 1 ? 'person is' : 'people are'} on it at the moment.
          </p>
        )}
        {close.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(close.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Leave it open
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={close.isPending}
            onClick={() =>
              close.mutate(mission.id, {
                onSuccess: () => setOpen(false),
              })
            }
          >
            {close.isPending ? 'Closing…' : CLOSE_MISSION_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
