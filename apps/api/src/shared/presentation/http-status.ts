import { HttpStatus } from '@nestjs/common'
import {
  ConflictError,
  type DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../result'

type DomainErrorClass = new (message: string, details?: unknown) => DomainError

/**
 * The one place a DomainError becomes an HTTP status. Ordered because a
 * context's own error subclasses one of these and must inherit its status.
 */
export const DOMAIN_ERROR_STATUS: readonly (readonly [DomainErrorClass, HttpStatus])[] = [
  [NotFoundError, HttpStatus.NOT_FOUND],
  [ConflictError, HttpStatus.CONFLICT],
  [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
  [ForbiddenError, HttpStatus.FORBIDDEN],
  [UnauthorizedError, HttpStatus.UNAUTHORIZED],
]

/** Any DomainError outside the table is a plain bad request. */
export const DEFAULT_DOMAIN_ERROR_STATUS = HttpStatus.BAD_REQUEST

export const INTERNAL_ERROR_CODE = 'INTERNAL'
export const INTERNAL_ERROR_MESSAGE = 'internal server error'

export function statusForDomainError(error: DomainError): HttpStatus {
  for (const [type, status] of DOMAIN_ERROR_STATUS) {
    if (error instanceof type) return status
  }

  return DEFAULT_DOMAIN_ERROR_STATUS
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'VALIDATION_FAILED',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
}

/** Framework-raised HTTP errors (a routing 404, say) still need a stable code. */
export function codeForHttpStatus(status: number): string {
  return CODE_BY_STATUS[status] ?? `HTTP_${status}`
}
