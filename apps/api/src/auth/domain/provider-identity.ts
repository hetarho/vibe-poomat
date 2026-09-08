import { Entity, EntityId } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'
import type { UnknownProviderError } from './auth-errors'
import type { AuthProvider } from './auth-provider'
import { parseAuthProvider } from './auth-provider'

type ProviderIdentityProps = {
  userId: EntityId
  provider: AuthProvider
  providerUserId: string
  email: string
  emailVerified: boolean
  createdAt: Date
  updatedAt: Date
}

/**
 * One provider account attached to one of ours. An account may hold several
 * (AUTH-5), which is why the email lives here rather than on the user: it is the
 * provider's claim about the person, not the profile's own field.
 */
export class ProviderIdentity extends Entity<ProviderIdentityProps> {
  private constructor(id: EntityId, props: ProviderIdentityProps) {
    super(id, props)
  }

  static create(input: {
    id?: EntityId
    userId: EntityId
    provider: string
    providerUserId: string
    email: string
    emailVerified: boolean
    now?: Date
  }): Result<ProviderIdentity, UnknownProviderError | ValidationError> {
    const provider = parseAuthProvider(input.provider)
    if (provider.isErr()) return err(provider.error)

    const providerUserId = input.providerUserId.trim()
    if (providerUserId.length === 0) {
      return err(new ValidationError('the provider did not return an account id'))
    }

    // lowercased once, here, so AUTH-5's "does this verified email match an
    // account" question can never turn on the casing a provider happened to send
    const email = input.email.trim().toLowerCase()
    if (email.length === 0) {
      return err(new ValidationError('the provider did not return an email address'))
    }

    const now = input.now ?? new Date()

    return ok(
      new ProviderIdentity(input.id ?? EntityId.generate(), {
        userId: input.userId,
        provider: provider.value,
        providerUserId,
        email,
        emailVerified: input.emailVerified,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: ProviderIdentityProps): ProviderIdentity {
    return new ProviderIdentity(id, { ...props })
  }

  get userId(): EntityId {
    return this.props.userId
  }

  get provider(): AuthProvider {
    return this.props.provider
  }

  get providerUserId(): string {
    return this.props.providerUserId
  }

  /** Never public (AUTH-4); notifications are the only consumer. */
  get email(): string {
    return this.props.email
  }

  get emailVerified(): boolean {
    return this.props.emailVerified
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }
}
