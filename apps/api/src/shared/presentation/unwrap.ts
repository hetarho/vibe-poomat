import type { DomainError, Result } from '../result'
import { DomainHttpException } from './domain-http-exception'
import { statusForDomainError } from './http-status'

/**
 * The single bridge from Result to HTTP: controllers call this instead of
 * inspecting the error channel themselves, so every endpoint maps errors alike.
 */
export function unwrap<T, E extends DomainError>(result: Result<T, E>): T {
  if (result.isOk()) return result.value

  const { code, message, details } = result.error

  throw new DomainHttpException(code, statusForDomainError(result.error), message, details)
}
