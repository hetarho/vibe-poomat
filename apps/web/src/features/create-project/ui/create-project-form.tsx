import type { projects } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import {
  EMPTY_PROJECT_FIELDS,
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
import { useCreateProject } from '../model/use-create-project'

export const CREATE_PROJECT_SUBMIT = 'Post project'

type CreateProjectFormProps = {
  /** PROJ-12: it is public the moment this returns, so the caller shows it. */
  onCreated: (project: projects.Project) => void
}

/** Empty means "there is none", which the api spells as an explicit null. */
function orNull(value: string): string | null {
  const trimmed = value.trim()

  return trimmed.length === 0 ? null : trimmed
}

/**
 * PROJ-1's fields, posted once the server has opened the URL itself (PROJ-2).
 * This form never probes the URL from the browser: whether a stranger can reach
 * it is not a question this side can answer, and a CORS failure here would say
 * "unreachable" about a site that works.
 */
export function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [values, setValues] = useState<ProjectFieldValues>(EMPTY_PROJECT_FIELDS)
  const [cover, setCover] = useState<PickedImage | null>(null)
  const create = useCreateProject()

  const local = localProblems(values)
  const fromServer = serverProblems(create.error)
  const problems = mergeProblems(local, fromServer)
  const blocked = hasProblem(local)

  function change(patch: Partial<ProjectFieldValues>): void {
    setValues((previous) => ({ ...previous, ...patch }))
  }

  function pickCover(picked: PickedImage | null): void {
    setCover(picked)
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (blocked || create.isPending) return

    // every other value survives a refusal, because this state is what the form
    // renders — a rejected URL costs the retyping of nothing (PROJ-2)
    create.mutate(
      {
        title: values.title.trim(),
        liveUrl: values.liveUrl.trim(),
        pitch: values.pitch.trim(),
        description: orNull(values.description),
        tags: values.tags,
        ...(cover === null ? {} : { coverKey: cover.key }),
      },
      { onSuccess: onCreated },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" aria-label="New project">
      <ProjectFields
        values={values}
        onChange={change}
        problems={problems}
        coverUrl={cover?.previewUrl ?? null}
        onCoverPicked={pickCover}
      />

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={blocked || create.isPending}>
            {create.isPending ? 'Checking the URL…' : CREATE_PROJECT_SUBMIT}
          </Button>
          {create.isPending ? (
            <span className="text-muted-foreground text-sm">
              The server is opening your URL to make sure it works.
            </span>
          ) : null}
        </div>
        {create.isError && Object.keys(fromServer).length === 0 ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(create.error)}
          </p>
        ) : null}
      </div>
    </form>
  )
}
