import { EntityId } from '../../shared/kernel'
import { err, NotFoundError, ok, type Result } from '../../shared/result'
import type { AuthProvider } from '../domain/auth-provider'
import type { IdentityRepository } from '../domain/identity.repository'
import type { User } from '../domain/user'
import type { UserRepository } from '../domain/user.repository'

export type MyProfile = {
  user: User
  /** AUTH-4: the owner's own address, which no public endpoint ever returns. */
  email: string
  providers: AuthProvider[]
}

/**
 * The signed-in account's own view of itself. The email comes from the identity
 * rather than the profile, because it is the provider's claim about the person
 * and not a field they own — a second provider (AUTH-5) adds another.
 */
export class GetMyProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly identities: IdentityRepository,
  ) {}

  async execute(userId: string): Promise<Result<MyProfile, NotFoundError>> {
    const id = EntityId.parse(userId)
    if (id.isErr()) return err(new NotFoundError('no such account'))

    const user = await this.users.findById(id.value)
    if (user === null) return err(new NotFoundError('no such account'))

    const identities = await this.identities.listByUserId(id.value)
    // a verified address is the one notifications may use, so it wins; failing
    // that the oldest identity's address is still the only one we have
    const preferred = identities.find((identity) => identity.emailVerified) ?? identities[0]

    return ok({
      user,
      email: preferred?.email ?? '',
      providers: identities.map((identity) => identity.provider),
    })
  }
}
