import { ApiError } from '@repo/api-client'

export const FALLBACK_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * The api's `code` is the contract (ARCH-17); the sentence a person reads is a
 * UI decision, so it lives here. An unmapped code never renders raw server text.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Some of that input is not valid. Check the highlighted fields.',
  UNAUTHORIZED: 'You need to sign in to do that.',
  FORBIDDEN: 'You do not have access to that.',
  NOT_FOUND: 'That is not here any more.',
  CONFLICT: 'That clashes with something that already exists.',
  TOO_MANY_REQUESTS: 'That was a lot at once. Give it a moment.',
  SERVICE_UNAVAILABLE: 'The service is briefly unavailable. Try again shortly.',
  INTERNAL: FALLBACK_ERROR_MESSAGE,
}

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_ERROR_MESSAGE

  return MESSAGE_BY_CODE[error.code] ?? FALLBACK_ERROR_MESSAGE
}

export function isKnownErrorCode(code: string): boolean {
  return code in MESSAGE_BY_CODE
}
