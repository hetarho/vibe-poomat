import { randomInt } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { eq, inArray } from 'drizzle-orm'
import { DOMAIN_EVENT_COLLECTOR, type DomainEventCollector } from '../../../shared/application'
import { getDb, isUniqueViolation } from '../../../shared/db'
import type { EntityId } from '../../../shared/kernel'
import { err, ok, type Result } from '../../../shared/result'
import { HandleNotAllowedError, HandleTakenError } from '../../domain/auth-errors'
import { Handle, handleCandidatesFrom, handleWithSuffix } from '../../domain/handle'
import type { User } from '../../domain/user'
import type { UserRepository } from '../../domain/user.repository'
import { fromUser, toUser } from './row-mapper'
import { users } from './schema'

/** Name drizzle-kit gives the unique constraint behind `handle`. */
const HANDLE_UNIQUE_CONSTRAINT = 'users_handle_unique'

/**
 * How many suffixed names to check in the one round trip. Deep enough that a
 * common username is settled in a single query, shallow enough that the query
 * stays small.
 */
const CANDIDATE_BATCH = 32

const RANDOM_SUFFIX_MIN = 100_000
const RANDOM_SUFFIX_MAX = 999_999

@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(@Inject(DOMAIN_EVENT_COLLECTOR) private readonly events: DomainEventCollector) {}

  async findById(id: EntityId): Promise<User | null> {
    const rows = await getDb().select().from(users).where(eq(users.id, id.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toUser(row)
  }

  async findByHandle(handle: Handle): Promise<User | null> {
    const rows = await getDb().select().from(users).where(eq(users.handle, handle.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toUser(row)
  }

  async save(user: User): Promise<Result<void, HandleTakenError>> {
    const row = fromUser(user)

    try {
      await getDb()
        .insert(users)
        .values(row)
        .onConflictDoUpdate({
          target: users.id,
          set: {
            handle: row.handle,
            displayName: row.displayName,
            avatarUrl: row.avatarUrl,
            bio: row.bio,
            link: row.link,
            updatedAt: row.updatedAt,
          },
        })
    } catch (error) {
      if (isUniqueViolation(error, HANDLE_UNIQUE_CONSTRAINT)) {
        return err(new HandleTakenError('that handle is already taken', { handle: row.handle }))
      }
      throw error
    }

    // drained here rather than by the use case, so an aggregate's events cannot
    // be published without the write that produced them having landed (ARCH-39)
    this.events.collect(user.pullEvents())

    return ok(undefined)
  }

  /**
   * AUTH-6's collision rule. One query settles the usual case: ask which of the
   * first `CANDIDATE_BATCH` names are taken and offer the first that is not.
   * Exhausting the batch means either a very popular username or a race, and a
   * random suffix ends the walk rather than paging further through it.
   */
  async generateAvailableHandle(seed: string): Promise<Handle> {
    const candidates = handleCandidatesFrom(seed, CANDIDATE_BATCH)
    const rows = await getDb()
      .select({ handle: users.handle })
      .from(users)
      .where(
        inArray(
          users.handle,
          candidates.map((candidate) => candidate.value),
        ),
      )
    const taken = new Set(rows.map((row) => row.handle.toLowerCase()))

    const free = candidates.find((candidate) => !taken.has(candidate.value))
    if (free !== undefined) return free

    const random = handleWithSuffix(seed, randomInt(RANDOM_SUFFIX_MIN, RANDOM_SUFFIX_MAX))
    if (random.isErr()) {
      // handleWithSuffix only rejects shapes it cannot produce from a digit suffix
      throw new HandleNotAllowedError('could not derive a handle from the seed', { seed })
    }

    return random.value
  }
}
