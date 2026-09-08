import { ConflictError, ValidationError } from '../../shared/result'

/**
 * Every expected failure this context can produce. The `code` is public API
 * (ARCH-17): stable, prefixed with the context, and what the web app switches on
 * to choose its copy.
 */
export class HandleNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_HANDLE_NOT_ALLOWED'
}

export class HandleTakenError extends ConflictError {
  override readonly code = 'AUTH_HANDLE_TAKEN'
}

export class DisplayNameNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_DISPLAY_NAME_NOT_ALLOWED'
}

export class BioNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_BIO_NOT_ALLOWED'
}

export class LinkNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_LINK_NOT_ALLOWED'
}

export class AvatarNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_AVATAR_NOT_ALLOWED'
}

export class UnknownProviderError extends ValidationError {
  override readonly code = 'AUTH_UNKNOWN_PROVIDER'
}

export class IdentityAlreadyLinkedError extends ConflictError {
  override readonly code = 'AUTH_IDENTITY_ALREADY_LINKED'
}

export class SessionIdNotAllowedError extends ValidationError {
  override readonly code = 'AUTH_SESSION_ID_NOT_ALLOWED'
}
