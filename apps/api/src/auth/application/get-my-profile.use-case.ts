import type { CreditSummaryReader, FileStorage } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { UserNotFoundError } from '../domain/auth-errors'
import type { IdentityRepository } from '../domain/identity.repository'
import type { UserRepository } from '../domain/user.repository'
import { type MyProfileView, toPublicProfile } from './profile-view'

/**
 * The signed-in account's own view of itself. The email comes from the identity
 * rather than the profile, because it is the provider's claim about the person
 * and not a field they own — a second provider (AUTH-5) adds another.
 */
export class GetMyProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly identities: IdentityRepository,
    private readonly storage: FileStorage,
    private readonly credits: CreditSummaryReader,
  ) {}

  async execute(userId: string): Promise<Result<MyProfileView, UserNotFoundError>> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return err(new UserNotFoundError('no such account'))

    const user = await this.users.findById(id.value)
    if (user === null) return err(new UserNotFoundError('no such account'))

    const identities = await this.identities.listByUserId(id.value)
    // a verified address is the one notifications may use, so it wins; failing
    // that the oldest identity's address is still the only one we have
    const preferred = identities.find((identity) => identity.emailVerified) ?? identities[0]

    return ok({
      ...toPublicProfile(user, this.storage, await this.credits.summaryFor(user.id.value)),
      email: preferred?.email ?? '',
      providers: identities.map((identity) => identity.provider),
    })
  }
}
