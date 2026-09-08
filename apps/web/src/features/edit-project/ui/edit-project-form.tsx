import type { projects } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import {
  hasProblem,
  localProblems,
  mergeProblems,
  ProjectFields,
  type ProjectFieldValues,
  serverProblems,
} from '../../../entities/project'
import { errorMessage } from '../../../shared/api'
import { Button } from '../../../shared/ui'
import type { PickedImage } from '../../../shared/upload'
import { useEditProject } from '../model/use-edit-project'

export const EDIT_PROJECT_SUBMIT = 'Save project'

/** PROJ-7, in the words the server would use if it were asked to change them. */
export const FROZEN_BY_MISSION =
  'Frozen while a mission is open — feedback has to match what the feedbackers were sent to look at.'

type EditProjectFormProps = {
  project: projects.Project
}

function orNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed.length === 0 ? null : trimmed
}

function valuesOf(project: projects.Project): ProjectFieldValues {
  return {
    title: project.title,
    liveUrl: project.liveUrl,
    pitch: project.pitch,
    description: project.description ?? '',
    tags: [...project.tags],
  }
}

/**
 * The owner's edit form. PROJ-7 is enforced by the server too; it is rendered
 * here as a disabled field with the reason, because a field somebody may type
 * into and then be refused is worse than one they can see is closed.
 */
export function EditProjectForm({ project }: EditProjectFormProps) {
  const [values, setValues] = useState<ProjectFieldValues>(valuesOf(project))
  const [cover, setCover] = useState<PickedImage | null>(null)
  const save = useEditProject(project.id)

  const missionIsOpen = project.activeMission !== null
  const local = localProblems(values)
  const problems = mergeProblems(local, serverProblems(save.error))
  const blocked = hasProblem(local)

  function change(patch: Partial<ProjectFieldValues>): void {
    setValues((previous) => ({ ...previous, ...patch }))
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (blocked || save.isPending) return

    // the frozen fields are left out of the request rather than sent unchanged:
    // an unchanged `liveUrl` would still make the server re-probe it (T022)
    save.mutate({
      ...(missionIsOpen ? {} : { title: values.title.trim(), liveUrl: values.liveUrl.trim() }),
      pitch: values.pitch.trim(),
      description: orNull(values.description),
      tags: values.tags,
      ...(cover === null ? {} : { coverKey: cover.key }),
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label="Edit project">
      <ProjectFields
        values={values}
        onChange={change}
        problems={problems}
        frozen={missionIsOpen ? FROZEN_BY_MISSION : null}
        coverUrl={cover?.previewUrl ?? project.coverUrl}
        onCoverPicked={setCover}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={blocked || save.isPending}>
            {save.isPending ? 'Saving…' : EDIT_PROJECT_SUBMIT}
          </Button>
          {save.isSuccess ? <span className="text-muted-foreground text-sm">Saved.</span> : null}
        </div>
        {save.isError && Object.keys(serverProblems(save.error)).length === 0 ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(save.error)}
          </p>
        ) : null}
      </div>
    </form>
  )
}
