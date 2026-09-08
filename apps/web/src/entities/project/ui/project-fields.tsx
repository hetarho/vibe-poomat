import type { ReactNode } from 'react'
import { useState } from 'react'
import { Input, Markdown, Textarea } from '../../../shared/ui'
import { ImagePicker, type PickedImage } from '../../../shared/upload'
import {
  DESCRIPTION_MAX_LENGTH,
  descriptionProblem,
  liveUrlProblem,
  MAX_TAGS,
  PITCH_MAX_LENGTH,
  PROJECT_TAGS,
  type ProjectTag,
  pitchProblem,
  TITLE_MAX_LENGTH,
  tagsProblem,
  textLength,
  titleProblem,
} from '../lib/project-rules'

/** Everything about a project somebody types, in one shape (PROJ-1). */
export type ProjectFieldValues = {
  title: string
  liveUrl: string
  pitch: string
  description: string
  tags: ProjectTag[]
}

export type ProjectFieldName = keyof ProjectFieldValues | 'cover'

export type ProjectFieldProblems = Partial<Record<ProjectFieldName, string | null>>

export const EMPTY_PROJECT_FIELDS: ProjectFieldValues = {
  title: '',
  liveUrl: '',
  pitch: '',
  description: '',
  tags: [],
}

/**
 * Everything this side can decide without asking. Both forms run it, so the
 * submit button of neither one sends a request the server would only refuse.
 */
export function localProblems(values: ProjectFieldValues): ProjectFieldProblems {
  return {
    title: titleProblem(values.title),
    liveUrl: liveUrlProblem(values.liveUrl),
    pitch: pitchProblem(values.pitch),
    description: descriptionProblem(values.description),
    tags: tagsProblem(values.tags),
  }
}

/**
 * A local problem wins over the server's, and the server's shows only where
 * this side found nothing — merging the other way round lets an absent local
 * problem (a `null`) erase what the server actually said about that field.
 */
export function mergeProblems(
  local: ProjectFieldProblems,
  fromServer: Record<string, string>,
): ProjectFieldProblems {
  const merged: ProjectFieldProblems = { ...local }
  for (const [field, message] of Object.entries(fromServer)) {
    const name = field as ProjectFieldName
    merged[name] = local[name] ?? message
  }

  return merged
}

export function hasProblem(problems: ProjectFieldProblems): boolean {
  return Object.values(problems).some((value) => value !== null && value !== undefined)
}

type FieldProps = {
  id: string
  label: string
  problem: string | null | undefined
  /** Why this field cannot be touched right now, when it cannot (PROJ-7). */
  frozen?: string | null
  counter?: ReactNode
  children: ReactNode
}

function Field({ id, label, problem, frozen, counter, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-medium text-sm" htmlFor={id}>
        {label}
      </label>
      {children}
      {counter}
      {frozen === null || frozen === undefined ? null : (
        <p className="text-muted-foreground text-xs">{frozen}</p>
      )}
      {problem === null || problem === undefined ? null : (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
    </div>
  )
}

type CounterProps = { id: string; value: string; max: number }

function Counter({ id, value, max }: CounterProps) {
  return (
    <p className="text-muted-foreground text-xs" data-testid={id}>
      {textLength(value)} / {max}
    </p>
  )
}

type ProjectFieldsProps = {
  values: ProjectFieldValues
  onChange: (patch: Partial<ProjectFieldValues>) => void
  problems: ProjectFieldProblems
  /**
   * PROJ-7: while a mission is open, what the feedbackers were sent to look at
   * cannot move under them. Null when nothing is frozen; otherwise the sentence
   * shown under each frozen field.
   */
  frozen?: string | null
  /** What the cover looks like now — an uploaded preview or the stored one. */
  coverUrl: string | null
  onCoverPicked: (picked: PickedImage | null) => void
}

/**
 * The project fields themselves, with no opinion about what happens on submit.
 * Create and edit differ only in which request they send and what they freeze,
 * so they share this rather than each owning a copy that drifts.
 */
export function ProjectFields({
  values,
  onChange,
  problems,
  frozen = null,
  coverUrl,
  onCoverPicked,
}: ProjectFieldsProps) {
  const [previewing, setPreviewing] = useState(false)

  function toggleTag(tag: ProjectTag): void {
    onChange({
      tags: values.tags.includes(tag)
        ? values.tags.filter((held) => held !== tag)
        : [...values.tags, tag],
    })
  }

  const atTagCap = values.tags.length >= MAX_TAGS

  return (
    <>
      <Field
        id="title"
        label="Title"
        problem={problems.title}
        frozen={frozen}
        counter={<Counter id="title-counter" value={values.title} max={TITLE_MAX_LENGTH} />}
      >
        <Input
          id="title"
          value={values.title}
          disabled={frozen !== null}
          aria-invalid={problems.title != null}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>

      <Field id="liveUrl" label="Live URL" problem={problems.liveUrl} frozen={frozen}>
        <Input
          id="liveUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.liveUrl}
          disabled={frozen !== null}
          aria-invalid={problems.liveUrl != null}
          onChange={(event) => onChange({ liveUrl: event.target.value })}
        />
      </Field>

      <Field
        id="pitch"
        label="Pitch"
        problem={problems.pitch}
        counter={<Counter id="pitch-counter" value={values.pitch} max={PITCH_MAX_LENGTH} />}
      >
        <Textarea
          id="pitch"
          rows={2}
          value={values.pitch}
          aria-invalid={problems.pitch != null}
          onChange={(event) => onChange({ pitch: event.target.value })}
        />
      </Field>

      <Field
        id="description"
        label="Description"
        problem={problems.description}
        counter={
          <Counter
            id="description-counter"
            value={values.description}
            max={DESCRIPTION_MAX_LENGTH}
          />
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              aria-pressed={!previewing}
              className={previewing ? 'text-muted-foreground' : 'font-medium underline'}
              onClick={() => setPreviewing(false)}
            >
              Write
            </button>
            <button
              type="button"
              aria-pressed={previewing}
              className={previewing ? 'font-medium underline' : 'text-muted-foreground'}
              onClick={() => setPreviewing(true)}
            >
              Preview
            </button>
            <span className="text-muted-foreground text-xs">Markdown</span>
          </div>
          {previewing ? (
            <section
              aria-label="Description preview"
              className="min-h-24 rounded-md border border-input px-3 py-2"
            >
              {values.description.trim().length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing to preview yet.</p>
              ) : (
                <Markdown>{values.description}</Markdown>
              )}
            </section>
          ) : (
            <Textarea
              id="description"
              rows={8}
              value={values.description}
              aria-invalid={problems.description != null}
              onChange={(event) => onChange({ description: event.target.value })}
            />
          )}
        </div>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium text-sm">Tags</legend>
        <p className="text-muted-foreground text-xs">One to {MAX_TAGS}, from this list (PROJ-3).</p>
        <div className="flex flex-wrap gap-2">
          {PROJECT_TAGS.map((tag) => {
            const held = values.tags.includes(tag)

            return (
              <button
                key={tag}
                type="button"
                aria-pressed={held}
                disabled={!held && atTagCap}
                className={
                  held
                    ? 'rounded-full bg-primary px-3 py-1 text-primary-foreground text-sm'
                    : 'rounded-full border border-input px-3 py-1 text-sm disabled:opacity-40'
                }
                onClick={() => toggleTag(tag)}
              >
                {tag}
              </button>
            )
          })}
        </div>
        {problems.tags == null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {problems.tags}
          </p>
        )}
      </fieldset>

      <ImagePicker
        id="cover"
        label="Cover image"
        purpose="project-cover"
        hint="Optional. PNG, JPEG or WebP, up to 2MB."
        preview={
          coverUrl === null ? null : (
            <img src={coverUrl} alt="" className="h-16 w-28 rounded object-cover" />
          )
        }
        onPicked={onCoverPicked}
      />
      {problems.cover == null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {problems.cover}
        </p>
      )}
    </>
  )
}
