import type { EntityId } from '../../shared/kernel'
import type { Result } from '../../shared/result'
import type { IdentityAlreadyLinkedError } from './auth-errors'
import type { AuthProvider } from './auth-provider'
import type { ProviderIdentity } from './provider-identity'

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY')

export type IdentityRepository = {
  /** The returning-user lookup: this provider account has signed in before. */
  findByProviderId(provider: AuthProvider, providerUserId: string): Promise<ProviderIdentity | null>
  /**
   * AUTH-5: only a *verified* provider email may attach a new identity to an
   * existing account, so an unverified row must never answer this question.
   */
  findByVerifiedEmail(email: string): Promise<ProviderIdentity | null>
  /** Every provider attached to one account, oldest first (AUTH-5). */
  listByUserId(userId: EntityId): Promise<ProviderIdentity[]>
  save(identity: ProviderIdentity): Promise<Result<void, IdentityAlreadyLinkedError>>
}
