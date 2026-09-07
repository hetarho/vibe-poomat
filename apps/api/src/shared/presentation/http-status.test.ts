import { HttpStatus } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../result'
import { codeForHttpStatus, DEFAULT_DOMAIN_ERROR_STATUS, statusForDomainError } from './http-status'

class UnmappedError extends DomainError {
  override readonly code = 'SOMETHING_ELSE'
}

/** How a context declares its own error: subclass the family, override the code. */
class SessionExpiredError extends UnauthorizedError {
  override readonly code = 'AUTH_SESSION_EXPIRED'
}

describe('statusForDomainError', () => {
  it.each([
    [NotFoundError, HttpStatus.NOT_FOUND],
    [ConflictError, HttpStatus.CONFLICT],
    [ValidationError, HttpStatus.UNPROCESSABLE_ENTITY],
    [ForbiddenError, HttpStatus.FORBIDDEN],
    [UnauthorizedError, HttpStatus.UNAUTHORIZED],
  ])('maps $name to its status', (ErrorClass, expected) => {
    expect(statusForDomainError(new ErrorClass('boom'))).toBe(expected)
  })

  it('falls back to 400 for a DomainError outside the table', () => {
    expect(statusForDomainError(new UnmappedError('boom'))).toBe(DEFAULT_DOMAIN_ERROR_STATUS)
    expect(DEFAULT_DOMAIN_ERROR_STATUS).toBe(HttpStatus.BAD_REQUEST)
  })

  it("gives a context's own error the status of the family it extends", () => {
    const error = new SessionExpiredError('session expired')

    expect(statusForDomainError(error)).toBe(HttpStatus.UNAUTHORIZED)
    expect(error.code).toBe('AUTH_SESSION_EXPIRED')
  })
})

describe('codeForHttpStatus', () => {
  it.each([
    [HttpStatus.BAD_REQUEST, 'BAD_REQUEST'],
    [HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED'],
    [HttpStatus.FORBIDDEN, 'FORBIDDEN'],
    [HttpStatus.NOT_FOUND, 'NOT_FOUND'],
    [HttpStatus.CONFLICT, 'CONFLICT'],
    [HttpStatus.UNPROCESSABLE_ENTITY, 'VALIDATION_FAILED'],
    [HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE'],
  ])('names status %i', (status, expected) => {
    expect(codeForHttpStatus(status)).toBe(expected)
  })

  it('still produces a stable code for a status it does not name', () => {
    expect(codeForHttpStatus(418)).toBe('HTTP_418')
  })
})
