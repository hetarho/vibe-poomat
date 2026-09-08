import { auth } from '@repo/contracts'

/**
 * The same limits the server enforces, checked here so somebody learns before
 * they submit rather than after. The server is still the authority: these
 * mirror its rules, they do not replace them.
 */
export const BIO_MAX_LENGTH = auth.BIO_MAX_LENGTH
export const DISPLAY_NAME_MAX_LENGTH = 50

/** Counted in code points, as the server does, so an emoji costs one character. */
export function bioLength(value: string): number {
  return [...value].length
}

export function displayNameProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'A display name is required.'
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `A display name may be at most ${DISPLAY_NAME_MAX_LENGTH} characters.`
  }

  return null
}

export function bioProblem(value: string): string | null {
  if (bioLength(value.trim()) > BIO_MAX_LENGTH) {
    return `A bio may be at most ${BIO_MAX_LENGTH} characters.`
  }

  return null
}

/**
 * https only, because the link is rendered for other people to click and an
 * http destination would downgrade whoever clicked it — the server's reason,
 * repeated here so the message is the same one.
 */
export function linkProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'That is not a URL.'
  }

  if (url.protocol !== 'https:') return 'A link must start with https://.'
  if (url.username !== '' || url.password !== '') return 'A link must not carry a password.'

  return null
}
