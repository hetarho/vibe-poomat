import type { Result as NeverthrowResult } from 'neverthrow'
import type { DomainError } from './domain-error'

export type { ResultAsync } from 'neverthrow'
export { err, errAsync, ok, okAsync } from 'neverthrow'
export {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './domain-error'

/**
 * The repo's Result: neverthrow's, narrowed so the error channel can only ever
 * carry a DomainError (ARCH-12). `throw` stays reserved for programmer errors.
 */
export type Result<T, E extends DomainError = DomainError> = NeverthrowResult<T, E>
