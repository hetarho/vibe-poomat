import { projects } from '@repo/contracts'

/**
 * PROJ-1 and PROJ-3, read from the contract rather than retyped, so the client
 * and the server can never disagree about a limit or about the tag list. The
 * server is still what decides; these exist so somebody learns before they
 * submit rather than after.
 */
export const PROJECT_TAGS = projects.PROJECT_TAGS
export const TITLE_MAX_LENGTH = projects.TITLE_MAX_LENGTH
export const PITCH_MAX_LENGTH = projects.PITCH_MAX_LENGTH
export const DESCRIPTION_MAX_LENGTH = projects.DESCRIPTION_MAX_LENGTH
export const MAX_TAGS = projects.MAX_TAGS

export type ProjectTag = projects.ProjectTag

/** Counted in code points, as the server counts them, so an emoji costs one. */
export function textLength(value: string): number {
  return [...value.trim()].length
}

export function titleProblem(value: string): string | null {
  const length = textLength(value)
  if (length === 0) return 'A title is required.'
  if (length > TITLE_MAX_LENGTH) {
    return `A title may be at most ${TITLE_MAX_LENGTH} characters.`
  }

  return null
}

export function pitchProblem(value: string): string | null {
  const length = textLength(value)
  if (length === 0) return 'A pitch is required — one line on what this is.'
  if (length > PITCH_MAX_LENGTH) {
    return `A pitch may be at most ${PITCH_MAX_LENGTH} characters.`
  }

  return null
}

/** Optional: an empty description is cleared with null, not refused. */
export function descriptionProblem(value: string): string | null {
  if (textLength(value) > DESCRIPTION_MAX_LENGTH) {
    return `A description may be at most ${DESCRIPTION_MAX_LENGTH} characters.`
  }

  return null
}

/**
 * PROJ-2 is about whether the URL can actually be opened, which only the server's
 * probe can answer. This decides the narrower question of whether it is the kind
 * of address worth asking about at all — the same one the server's value object asks.
 */
export function liveUrlProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'A live URL is required — people have to be able to use it.'

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'That is not a URL. It should start with https://.'
  }

  if (url.protocol !== 'https:') return 'A live URL must start with https://.'
  if (url.hostname === '') return 'That URL has no host.'
  if (url.username !== '' || url.password !== '') {
    return 'A live URL must not carry a password.'
  }

  return null
}

/** PROJ-3: one to three of the fixed list, each at most once. */
export function tagsProblem(tags: readonly string[]): string | null {
  if (tags.length === 0) return 'Pick at least one tag.'
  if (tags.length > MAX_TAGS) return `Pick at most ${MAX_TAGS} tags.`

  return null
}
