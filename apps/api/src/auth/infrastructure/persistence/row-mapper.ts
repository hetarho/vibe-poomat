import { EntityId } from '../../../shared/kernel'
import type { DomainError, Result } from '../../../shared/result'
import { parseAuthProvider } from '../../domain/auth-provider'
import { Bio } from '../../domain/bio'
import { ExternalLink } from '../../domain/external-link'
import { Handle } from '../../domain/handle'
import { ProviderIdentity } from '../../domain/provider-identity'
import { Session } from '../../domain/session'
import { SessionId } from '../../domain/session-id'
import { User } from '../../domain/user'
import type { identities, sessions, users } from './schema'

/**
 * Everything below writes through the same value objects that guard the way in,
 * so a row that fails to parse is corruption rather than an expected failure,
 * and `throw` is the right answer to it (ARCH-12).
 */
function must<T>(result: Result<T, DomainError>, what: string): T {
  if (result.isErr()) {
    throw new Error(`stored ${what} is not valid: ${result.error.message}`)
  }

  return result.value
}

type UserRow = typeof users.$inferSelect
type IdentityRow = typeof identities.$inferSelect
type SessionRow = typeof sessions.$inferSelect

export function toUser(row: UserRow): User {
  return User.restore(must(EntityId.parse(row.id), 'user id'), {
    handle: must(Handle.create(row.handle), 'handle'),
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio === null ? null : must(Bio.create(row.bio), 'bio'),
    link: row.link === null ? null : must(ExternalLink.create(row.link), 'link'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function fromUser(user: User): typeof users.$inferInsert {
  return {
    id: user.id.value,
    handle: user.handle.value,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio?.value ?? null,
    link: user.link?.value ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

export function toProviderIdentity(row: IdentityRow): ProviderIdentity {
  return ProviderIdentity.restore(must(EntityId.parse(row.id), 'identity id'), {
    userId: must(EntityId.parse(row.userId), 'identity user id'),
    provider: must(parseAuthProvider(row.provider), 'provider'),
    providerUserId: row.providerUserId,
    email: row.email,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

export function fromProviderIdentity(identity: ProviderIdentity): typeof identities.$inferInsert {
  return {
    id: identity.id.value,
    userId: identity.userId.value,
    provider: identity.provider,
    providerUserId: identity.providerUserId,
    email: identity.email,
    emailVerified: identity.emailVerified,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
  }
}

export function toSession(row: SessionRow): Session {
  return Session.restore(must(SessionId.parse(row.id), 'session id'), {
    userId: must(EntityId.parse(row.userId), 'session user id'),
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
  })
}

export function fromSession(session: Session): typeof sessions.$inferInsert {
  return {
    id: session.id.value,
    userId: session.userId.value,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
  }
}
