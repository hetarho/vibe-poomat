import type { DomainEvent, EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { HandleTakenError, IdentityAlreadyLinkedError } from '../domain/auth-errors'
import type { AuthProvider } from '../domain/auth-provider'
import { Handle, handleCandidatesFrom } from '../domain/handle'
import type { IdentityRepository } from '../domain/identity.repository'
import type { ProviderIdentity } from '../domain/provider-identity'
import type { Session } from '../domain/session'
import type { SessionRepository } from '../domain/session.repository'
import type { SessionId } from '../domain/session-id'
import type { SessionIdGenerator } from '../domain/session-id-generator'
import type { User } from '../domain/user'
import type { UserRepository } from '../domain/user.repository'

/**
 * Fakes rather than mocks: the use case tests assert on what ended up stored,
 * which is the thing that matters, and these hold the same invariants the real
 * tables do — the uniqueness rules above all.
 */
export class InMemoryUserRepository implements UserRepository {
  readonly rows = new Map<string, User>()
  readonly events: DomainEvent[] = []

  async findById(id: EntityId): Promise<User | null> {
    return this.rows.get(id.value) ?? null
  }

  async findByHandle(handle: Handle): Promise<User | null> {
    for (const user of this.rows.values()) {
      if (user.handle.equals(handle)) return user
    }

    return null
  }

  async save(user: User): Promise<Result<void, HandleTakenError>> {
    for (const [id, existing] of this.rows) {
      if (id !== user.id.value && existing.handle.equals(user.handle)) {
        return err(new HandleTakenError('that handle is already taken'))
      }
    }

    this.rows.set(user.id.value, user)
    // the Drizzle adapter drains here too, so the events land the same way
    this.events.push(...user.pullEvents())

    return ok(undefined)
  }

  async generateAvailableHandle(seed: string): Promise<Handle> {
    const taken = new Set([...this.rows.values()].map((user) => user.handle.value))
    const free = handleCandidatesFrom(seed, 32).find((candidate) => !taken.has(candidate.value))
    if (free === undefined) throw new Error(`no handle available for ${seed}`)

    return free
  }
}

export class InMemoryIdentityRepository implements IdentityRepository {
  readonly rows: ProviderIdentity[] = []

  async findByProviderId(
    provider: AuthProvider,
    providerUserId: string,
  ): Promise<ProviderIdentity | null> {
    return (
      this.rows.find((row) => row.provider === provider && row.providerUserId === providerUserId) ??
      null
    )
  }

  async findByVerifiedEmail(email: string): Promise<ProviderIdentity | null> {
    const wanted = email.trim().toLowerCase()

    return this.rows.find((row) => row.emailVerified && row.email === wanted) ?? null
  }

  async listByUserId(userId: EntityId): Promise<ProviderIdentity[]> {
    return this.rows.filter((row) => row.userId.equals(userId))
  }

  async save(identity: ProviderIdentity): Promise<Result<void, IdentityAlreadyLinkedError>> {
    const clash = await this.findByProviderId(identity.provider, identity.providerUserId)
    if (clash !== null && !clash.id.equals(identity.id)) {
      return err(new IdentityAlreadyLinkedError('that provider account is already linked'))
    }

    this.rows.push(identity)

    return ok(undefined)
  }
}

export class InMemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, Session>()

  async findById(id: SessionId): Promise<Session | null> {
    return this.rows.get(id.value) ?? null
  }

  async save(session: Session): Promise<void> {
    this.rows.set(session.id.value, session)
  }

  async delete(id: SessionId): Promise<void> {
    this.rows.delete(id.value)
  }

  async deleteExpired(now: Date): Promise<number> {
    let removed = 0
    for (const [id, session] of this.rows) {
      if (!session.isExpired(now)) continue
      this.rows.delete(id)
      removed += 1
    }

    return removed
  }
}

/** Deterministic ids, so a test can name the session it expects to be issued. */
export class StubSessionIdGenerator implements SessionIdGenerator {
  private issued = 0

  constructor(private readonly ids: SessionId[]) {}

  next(): SessionId {
    const id = this.ids[this.issued]
    if (id === undefined) throw new Error('the stub ran out of session ids')
    this.issued += 1

    return id
  }
}

/** Runs the work as-is: the real transaction is exercised by the integration test. */
export const passthroughTransactions = {
  run: async <T>(work: () => Promise<T>): Promise<T> => work(),
}
