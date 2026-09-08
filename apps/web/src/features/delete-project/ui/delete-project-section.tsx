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
import { BLOCKED_BY_MISSION, PROJECT_DELETION_CONSEQUENCES } from '../lib/consequences'
import { useDeleteProject } from '../model/use-delete-project'

export const DELETE_PROJECT_HEADING = 'Delete this project'

type DeleteProjectSectionProps = {
  projectId: string
  title: string
  /** PROJ-8: blocked outright while a mission is open. */
  missionIsOpen: boolean
  onDeleted: () => void
}

/**
 * PROJ-8. The consequences are stated in the confirmation rather than after it,
 * because "deleted" is the wrong word for what happens: the project stops being
 * public and the feedback about it does not move.
 */
export function DeleteProjectSection({
  projectId,
  title,
  missionIsOpen,
  onDeleted,
}: DeleteProjectSectionProps) {
  const [open, setOpen] = useState(false)
  const remove = useDeleteProject(projectId)

  return (
    <section
      aria-label={DELETE_PROJECT_HEADING}
      className="rounded-md border border-destructive/40 p-4"
    >
      <h2 className="font-semibold text-destructive">{DELETE_PROJECT_HEADING}</h2>
      {missionIsOpen ? (
        <p className="mt-2 text-muted-foreground text-sm">{BLOCKED_BY_MISSION}</p>
      ) : (
        <p className="mt-2 text-muted-foreground text-sm">
          It stops being public. What people already wrote stays yours to read.
        </p>
      )}

      <div className="mt-4">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" disabled={missionIsOpen}>
              Delete project
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Delete “{title}”?</DialogTitle>
              <DialogDescription>This is what happens.</DialogDescription>
            </DialogHeader>
            <ul className="list-disc pl-5 text-sm">
              {PROJECT_DELETION_CONSEQUENCES.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {remove.isError ? (
              <p role="alert" className="text-destructive text-sm">
                {errorMessage(remove.error)}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Keep it
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(undefined, { onSuccess: onDeleted })}
              >
                {remove.isPending ? 'Deleting…' : 'Delete project'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  )
}
