import { ApiError } from '@repo/api-client'

/**
 * T006 puts a `details` map on a validation failure, keyed by the field that was
 * wrong. Rendering it beside the field is the whole point of that shape — a
 * banner saying "some input is not valid" wastes it.
 */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || typeof error.details !== 'object' || error.details === null) {
    return {}
  }

  const found: Record<string, string> = {}
  for (const [field, messages] of Object.entries(error.details as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : messages
    if (typeof first === 'string') found[field] = first
  }

  return found
}
