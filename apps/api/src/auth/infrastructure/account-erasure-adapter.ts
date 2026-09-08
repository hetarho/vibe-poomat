import { Inject, Injectable } from '@nestjs/common'
import type { AccountErasure } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ok, type Result } from '../../shared/result'
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../domain/identity.repository'
import { SESSION_REPOSITORY, type SessionRepository } from '../domain/session.repository'
import { USER_REPOSITORY, type UserRepository } from '../domain/user.repository'

/**
 * The last step of AUTH-9, and the only one that is a real delete: everything
 * `auth` owns goes, in this order, so nothing is left pointing at a row that is
 * no longer there. Signing in with the same provider afterwards creates a new
 * account, which is the point — there is no grace period and nothing to restore.
 *
 * The handle is freed with the row, so somebody else may take it.
 */
@Injectable()
export class AccountErasureAdapter implements AccountErasure {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(IDENTITY_REPOSITORY) private readonly identities: IdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
  ) {}

  async eraseAccount(userId: string): Promise<Result<void, DomainError>> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return err(id.error)

    await this.sessions.deleteAllFor(id.value)
    await this.identities.deleteAllFor(id.value)
    await this.users.delete(id.value)

    return ok(undefined)
  }
}
