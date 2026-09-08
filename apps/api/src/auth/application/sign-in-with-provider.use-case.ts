import type { TransactionManager } from '../../shared/application'
import { err, NotFoundError, ok, type Result } from '../../shared/result'
import type { HandleTakenError, IdentityAlreadyLinkedError } from '../domain/auth-errors'
import { Avatar } from '../domain/avatar'
import type { IdentityRepository } from '../domain/identity.repository'
import { ProviderIdentity } from '../domain/provider-identity'
import { Session } from '../domain/session'
import type { SessionRepository } from '../domain/session.repository'
import type { SessionId } from '../domain/session-id'
import type { SessionIdGenerator } from '../domain/session-id-generator'
import { User } from '../domain/user'
import type { UserRepository } from '../domain/user.repository'
import type { ProviderProfile } from './oauth-provider'

export type SignInWithProviderCommand = {
  profile: ProviderProfile
  /** The session this browser arrived with, if any. Rotated away on success. */
  previousSessionId?: SessionId | null
  now?: Date
}

export type SignInOutcome = {
  user: User
  session: Session
  /** True only when this sign-in was also the signup (AUTH-2). */
  created: boolean
}

export type SignInError = HandleTakenError | IdentityAlreadyLinkedError | NotFoundError

/**
 * The whole of AUTH-2 and AUTH-5 in one transaction (ARCH-38): recognise the
 * provider account, or attach it to the account that already owns its verified
 * email, or create one — then issue the session.
 *
 * A plain class with no framework import (ARCH-11); the module wires it.
 */
export class SignInWithProviderUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly identities: IdentityRepository,
    private readonly sessions: SessionRepository,
    private readonly sessionIds: SessionIdGenerator,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(command: SignInWithProviderCommand): Promise<Result<SignInOutcome, SignInError>> {
    return this.transactions.run(async () => {
      const resolved = await this.resolveUser(command)
      if (resolved.isErr()) return err(resolved.error)

      const { user, created } = resolved.value

      // fixation defence: whatever the browser arrived holding stops working the
      // moment it is handed something new, and it costs one delete
      if (command.previousSessionId !== undefined && command.previousSessionId !== null) {
        await this.sessions.delete(command.previousSessionId)
      }

      const session = Session.start({
        id: this.sessionIds.next(),
        userId: user.id,
        now: command.now,
      })
      await this.sessions.save(session)

      return ok({ user, session, created })
    })
  }

  private async resolveUser(
    command: SignInWithProviderCommand,
  ): Promise<Result<{ user: User; created: boolean }, SignInError>> {
    const { profile } = command

    // 1. this provider account has signed in before
    const known = await this.identities.findByProviderId(profile.provider, profile.providerUserId)
    if (known !== null) {
      const user = await this.users.findById(known.userId)
      if (user === null) {
        return err(new NotFoundError('the account this identity belongs to no longer exists'))
      }

      return ok({ user, created: false })
    }

    // 2. AUTH-5: a verified provider email that already reaches an account
    //    attaches as another identity rather than starting a second account
    if (profile.emailVerified) {
      const sibling = await this.identities.findByVerifiedEmail(profile.email)
      if (sibling !== null) {
        const user = await this.users.findById(sibling.userId)
        if (user === null) {
          return err(new NotFoundError('the account this email reaches no longer exists'))
        }

        const attached = await this.attachIdentity(user, command)
        if (attached.isErr()) return err(attached.error)

        return ok({ user, created: false })
      }
    }

    // 3. AUTH-2: the first successful sign-in is the signup
    return this.createAccount(command)
  }

  private async createAccount(
    command: SignInWithProviderCommand,
  ): Promise<Result<{ user: User; created: boolean }, SignInError>> {
    const { profile } = command
    const handle = await this.users.generateAvailableHandle(profile.username)

    // an avatar URL the provider sent that we cannot parse is simply dropped:
    // a picture is never worth refusing a signup over
    const avatar = profile.avatarUrl === null ? null : Avatar.fromUrl(profile.avatarUrl)
    const prefilled = avatar !== null && avatar.isOk() ? avatar.value : null

    const signedUp = User.signUp({
      handle,
      displayName: profile.displayName,
      avatar: prefilled,
      now: command.now,
    })
    if (signedUp.isOk()) return this.persistNewAccount(signedUp.value, command)

    // the provider handed us a name the profile rules refuse. The handle is ours
    // to choose and always legal, so it stands in rather than turning someone
    // away at the door over a display name they can edit later
    const fallback = User.signUp({
      handle,
      displayName: handle.value,
      avatar: null,
      now: command.now,
    })
    if (fallback.isErr()) {
      throw new Error(`a generated handle was refused as a display name: ${handle.value}`)
    }

    return this.persistNewAccount(fallback.value, command)
  }

  private async persistNewAccount(
    user: User,
    command: SignInWithProviderCommand,
  ): Promise<Result<{ user: User; created: boolean }, SignInError>> {
    const saved = await this.users.save(user)
    if (saved.isErr()) return err(saved.error)

    const attached = await this.attachIdentity(user, command)
    if (attached.isErr()) return err(attached.error)

    return ok({ user, created: true })
  }

  private async attachIdentity(
    user: User,
    command: SignInWithProviderCommand,
  ): Promise<Result<void, SignInError>> {
    const { profile } = command
    const identity = ProviderIdentity.create({
      userId: user.id,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      emailVerified: profile.emailVerified,
      now: command.now,
    })
    if (identity.isErr()) {
      // the profile came through a port that already promised these fields, so
      // this is a broken adapter rather than a caller's mistake
      throw new Error(`the provider profile is not usable: ${identity.error.message}`)
    }

    return this.identities.save(identity.value)
  }
}
