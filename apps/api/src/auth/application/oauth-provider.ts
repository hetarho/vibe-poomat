import type { Result } from '../../shared/result'
import { UnauthorizedError, ValidationError } from '../../shared/result'
import type { AuthProvider } from '../domain/auth-provider'

export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS')

/** What a provider is asked to tell us about the person signing in. */
export type ProviderProfile = {
  provider: AuthProvider
  providerUserId: string
  /** Never public (AUTH-4); notifications are the only consumer. */
  email: string
  /** AUTH-5 links on this alone, so an unverified claim must arrive as false. */
  emailVerified: boolean
  displayName: string
  avatarUrl: string | null
  /** Seeds the handle at signup (AUTH-6). */
  username: string
}

export type AuthorizationRequest = {
  url: string
  state: string
  /** PKCE, where the provider supports it; null otherwise. */
  codeVerifier: string | null
}

export class ProviderNotConfiguredError extends ValidationError {
  override readonly code = 'AUTH_PROVIDER_NOT_CONFIGURED'
}

export class ProviderExchangeFailedError extends UnauthorizedError {
  override readonly code = 'AUTH_PROVIDER_EXCHANGE_FAILED'
}

export class ProviderEmailUnverifiedError extends UnauthorizedError {
  override readonly code = 'AUTH_PROVIDER_EMAIL_UNVERIFIED'
}

/** The state cookie and the state the provider echoed back do not match. */
export class StateMismatchError extends UnauthorizedError {
  override readonly code = 'AUTH_STATE_MISMATCH'
}

/** The person said no on the consent screen, or the provider refused for us. */
export class ProviderDeniedError extends UnauthorizedError {
  override readonly code = 'AUTH_PROVIDER_DENIED'
}

export type ProviderFetchError = ProviderExchangeFailedError | ProviderEmailUnverifiedError

/**
 * One provider's whole side of the dance. Authorize URL, code exchange and
 * profile lookup live together because they are the same provider's business,
 * and behind one port because the use case must not know which of them it is
 * talking to (ARCH-11).
 */
export type OAuthProviderClient = {
  createAuthorization(): AuthorizationRequest
  fetchProfile(input: {
    code: string
    codeVerifier: string | null
  }): Promise<Result<ProviderProfile, ProviderFetchError>>
}

export type OAuthProviderRegistry = {
  clientFor(provider: AuthProvider): Result<OAuthProviderClient, ProviderNotConfiguredError>
}
