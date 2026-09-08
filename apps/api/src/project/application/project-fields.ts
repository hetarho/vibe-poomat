import { err, ok, type Result } from '../../shared/result'
import type { ProjectPatch } from '../domain/project'
import type {
  CoverNotAllowedError,
  DescriptionNotAllowedError,
  LiveUrlNotAllowedError,
  PitchNotAllowedError,
  TagsNotAllowedError,
  TitleNotAllowedError,
} from '../domain/project-errors'
import { Cover, Description, LiveUrl, Pitch, Tags, Title } from '../domain/project-values'

export type ProjectFieldError =
  | TitleNotAllowedError
  | PitchNotAllowedError
  | DescriptionNotAllowedError
  | LiveUrlNotAllowedError
  | TagsNotAllowedError
  | CoverNotAllowedError

/** Absent leaves a field alone; null clears one that may be absent. */
export type ProjectFieldInput = {
  title?: string
  pitch?: string
  description?: string | null
  tags?: readonly string[]
  coverKey?: string | null
}

/**
 * Parses every supplied field into its value object before anything is written,
 * so a rejected tag list cannot leave a half-applied pitch behind. Shared by
 * create and update, which is why it answers with a patch rather than a project.
 */
export function parseProjectFields(
  input: ProjectFieldInput,
): Result<ProjectPatch, ProjectFieldError> {
  const patch: ProjectPatch = {}

  if (input.title !== undefined) {
    const title = Title.create(input.title)
    if (title.isErr()) return err(title.error)
    patch.title = title.value
  }

  if (input.pitch !== undefined) {
    const pitch = Pitch.create(input.pitch)
    if (pitch.isErr()) return err(pitch.error)
    patch.pitch = pitch.value
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      patch.description = null
    } else {
      const description = Description.create(input.description)
      if (description.isErr()) return err(description.error)
      patch.description = description.value
    }
  }

  if (input.tags !== undefined) {
    const tags = Tags.create(input.tags)
    if (tags.isErr()) return err(tags.error)
    patch.tags = tags.value
  }

  if (input.coverKey !== undefined) {
    if (input.coverKey === null) {
      patch.cover = null
    } else {
      const cover = Cover.fromStorageKey(input.coverKey)
      if (cover.isErr()) return err(cover.error)
      patch.cover = cover.value
    }
  }

  return ok(patch)
}

export function parseLiveUrl(raw: string): Result<LiveUrl, LiveUrlNotAllowedError> {
  return LiveUrl.create(raw)
}

export type NewProjectFields = {
  title: Title
  pitch: Pitch
  tags: Tags
  description: Description | null
  cover: Cover | null
}

/**
 * The same parsing as above, for a create, where three of the fields are
 * required rather than optional — so the caller gets them as values instead of
 * as maybes it has to unwrap.
 */
export function parseNewProjectFields(input: {
  title: string
  pitch: string
  tags: readonly string[]
  description?: string | null
  coverKey?: string | null
}): Result<NewProjectFields, ProjectFieldError> {
  const patch = parseProjectFields(input)
  if (patch.isErr()) return err(patch.error)

  const { title, pitch, tags } = patch.value
  if (title === undefined || pitch === undefined || tags === undefined) {
    throw new Error('parseProjectFields dropped a field a create requires')
  }

  return ok({
    title,
    pitch,
    tags,
    description: patch.value.description ?? null,
    cover: patch.value.cover ?? null,
  })
}
