import { Inject, Injectable } from '@nestjs/common'
import type { NotificationRecipient, NotificationRecipientReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../domain/identity.repository'
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository'

/**
 * AUTH-4: the provider email exists for notifications, and this is the only way
 * out of this context to it. It is deliberately not on `UserSummary`, which
 * every context holds — a display name is public, an address is not.
 *
 * A verified address wins over an unverified one for the same reason AUTH-5 uses
 * verification to link accounts: it is the one the provider stands behind.
 */
@Injectable()
export class NotificationRecipientAdapter implements NotificationRecipientReader {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(IDENTITY_REPOSITORY) private readonly identities: IdentityRepository,
  ) {}

  async recipientFor(userId: string): Promise<NotificationRecipient | null> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return null

    const user = await this.users.findById(id.value)
    // gone (AUTH-9): a job queued before the deletion has nobody to reach
    if (user === null) return null

    const identities = await this.identities.listByUserId(id.value)
    const preferred = identities.find((identity) => identity.emailVerified) ?? identities[0]
    if (preferred === undefined) return null

    return {
      userId: user.id.value,
      email: preferred.email,
      displayName: user.displayName,
      handle: user.handle.value,
    }
  }
}
