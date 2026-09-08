import type { EntityId } from '../../shared/kernel'
import type { Result } from '../../shared/result'
import type { HandleTakenError } from './auth-errors'
import type { Handle } from './handle'
import type { User } from './user'

export const USER_REPOSITORY = Symbol('USER_REPOSITORY')

export type UserRepository = {
  findById(id: EntityId): Promise<User | null>
  findByHandle(handle: Handle): Promise<User | null>
  /**
   * Inserts or updates. A handle someone else already holds comes back as a
   * domain error rather than a driver exception: only the database can decide
   * that race, so only it can report it (ARCH-12).
   */
  save(user: User): Promise<Result<void, HandleTakenError>>
  /** AUTH-6: the seed, then the seed with a numeric suffix, until one is free. */
  generateAvailableHandle(seed: string): Promise<Handle>
  /** AUTH-9: irreversible, with no grace period and no tombstone. */
  delete(id: EntityId): Promise<void>
}
