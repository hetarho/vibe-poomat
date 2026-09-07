/**
 * Base of every expected failure. `code` is public API (ARCH-17): stable,
 * SCREAMING_SNAKE, and prefixed by its context once contexts exist
 * (`AUTH_SESSION_EXPIRED`). The classes here carry a generic default that a
 * context's own subclass overrides.
 */
export abstract class DomainError extends Error {
  readonly code: string = 'DOMAIN_ERROR'
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    if (details !== undefined) this.details = details
  }
}

export class NotFoundError extends DomainError {
  override readonly code: string = 'NOT_FOUND'
}

export class ConflictError extends DomainError {
  override readonly code: string = 'CONFLICT'
}

export class ValidationError extends DomainError {
  override readonly code: string = 'VALIDATION_FAILED'
}

export class ForbiddenError extends DomainError {
  override readonly code: string = 'FORBIDDEN'
}

export class UnauthorizedError extends DomainError {
  override readonly code: string = 'UNAUTHORIZED'
}
