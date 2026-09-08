import { auth } from '@repo/contracts'

export const HANDLE_MIN_LENGTH = auth.HANDLE_MIN_LENGTH
export const HANDLE_MAX_LENGTH = auth.HANDLE_MAX_LENGTH

/**
 * AUTH-6's shape, checked here so the rule is visible while typing. Whether a
 * handle is *free* is only ever the server's answer — a check here would be a
 * race with whoever is typing the same word somewhere else.
 */
export function handleProblem(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) return 'A handle is required.'
  if (trimmed.length < HANDLE_MIN_LENGTH || trimmed.length > HANDLE_MAX_LENGTH) {
    return `A handle is ${HANDLE_MIN_LENGTH} to ${HANDLE_MAX_LENGTH} characters.`
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return 'A handle may only contain a-z, 0-9 and underscore.'
  }

  return null
}
