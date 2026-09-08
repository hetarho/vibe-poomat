import type { CreditSummaryReader, FileStorage, MakerStatsReader } from '../../shared/application'
import { err, ok, type Result } from '../../shared/result'
import { UserNotFoundError } from '../domain/auth-errors'
import { Handle } from '../domain/handle'
import type { UserRepository } from '../domain/user.repository'
import { type PublicProfileView, toPublicProfile } from './profile-view'

/**
 * Keyed by handle rather than id, so the web route `/@handle` (AUTH-6) needs no
 * lookup of its own. A handle that is not even a legal one is the same answer as
 * a handle nobody holds: there is nothing here for the caller either way.
 */
export class GetPublicProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly storage: FileStorage,
    private readonly credits: CreditSummaryReader,
    private readonly makerStats: MakerStatsReader,
  ) {}

  async execute(rawHandle: string): Promise<Result<PublicProfileView, UserNotFoundError>> {
    const handle = Handle.create(rawHandle)
    if (handle.isErr()) return err(new UserNotFoundError('no such account'))

    const user = await this.users.findByHandle(handle.value)
    if (user === null) return err(new UserNotFoundError('no such account'))

    return ok(
      toPublicProfile(
        user,
        this.storage,
        await this.credits.summaryFor(user.id.value),
        await this.makerStats.statsFor(user.id.value),
      ),
    )
  }
}
