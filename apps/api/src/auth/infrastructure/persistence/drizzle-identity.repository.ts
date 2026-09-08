import { Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { getDb, isUniqueViolation } from '../../../shared/db'
import type { EntityId } from '../../../shared/kernel'
import { err, ok, type Result } from '../../../shared/result'
import { IdentityAlreadyLinkedError } from '../../domain/auth-errors'
import type { AuthProvider } from '../../domain/auth-provider'
import type { IdentityRepository } from '../../domain/identity.repository'
import type { ProviderIdentity } from '../../domain/provider-identity'
import { fromProviderIdentity, toProviderIdentity } from './row-mapper'
import { identities } from './schema'

const PROVIDER_ACCOUNT_UNIQUE_CONSTRAINT = 'identities_provider_account_unq'

@Injectable()
export class DrizzleIdentityRepository implements IdentityRepository {
  async findByProviderId(
    provider: AuthProvider,
    providerUserId: string,
  ): Promise<ProviderIdentity | null> {
    const rows = await getDb()
      .select()
      .from(identities)
      .where(and(eq(identities.provider, provider), eq(identities.providerUserId, providerUserId)))
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toProviderIdentity(row)
  }

  /**
   * AUTH-5 attaches a new provider to an existing account only on a verified
   * email, so an unverified row must not answer here — otherwise anyone able to
   * set an unverified address at a provider could walk into someone's account.
   */
  async findByVerifiedEmail(email: string): Promise<ProviderIdentity | null> {
    const rows = await getDb()
      .select()
      .from(identities)
      .where(
        and(eq(identities.email, email.trim().toLowerCase()), eq(identities.emailVerified, true)),
      )
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toProviderIdentity(row)
  }

  async listByUserId(userId: EntityId): Promise<ProviderIdentity[]> {
    const rows = await getDb()
      .select()
      .from(identities)
      .where(eq(identities.userId, userId.value))
      .orderBy(asc(identities.createdAt))

    return rows.map(toProviderIdentity)
  }

  async deleteAllFor(userId: EntityId): Promise<void> {
    await getDb().delete(identities).where(eq(identities.userId, userId.value))
  }

  async save(identity: ProviderIdentity): Promise<Result<void, IdentityAlreadyLinkedError>> {
    const row = fromProviderIdentity(identity)

    try {
      await getDb()
        .insert(identities)
        .values(row)
        .onConflictDoUpdate({
          target: identities.id,
          set: {
            email: row.email,
            emailVerified: row.emailVerified,
            updatedAt: row.updatedAt,
          },
        })
    } catch (error) {
      if (isUniqueViolation(error, PROVIDER_ACCOUNT_UNIQUE_CONSTRAINT)) {
        return err(
          new IdentityAlreadyLinkedError('that provider account is already linked to an account', {
            provider: row.provider,
          }),
        )
      }
      throw error
    }

    return ok(undefined)
  }
}
