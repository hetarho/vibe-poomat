import { Module } from '@nestjs/common'
import { IDENTITY_REPOSITORY } from './domain/identity.repository'
import { SESSION_REPOSITORY } from './domain/session.repository'
import { SESSION_ID_GENERATOR } from './domain/session-id-generator'
import { USER_REPOSITORY } from './domain/user.repository'
import { DrizzleIdentityRepository } from './infrastructure/persistence/drizzle-identity.repository'
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository'
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository'
import { RandomSessionIdGenerator } from './infrastructure/random-session-id-generator'

/**
 * The `auth` bounded context (ARCH-9): accounts, the provider identities that
 * reach them and the sessions they hold. The ports are exported under their
 * Symbol tokens, which is the only way another context may reach in (ARCH-11).
 */
@Module({
  providers: [
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: IDENTITY_REPOSITORY, useClass: DrizzleIdentityRepository },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: SESSION_ID_GENERATOR, useClass: RandomSessionIdGenerator },
  ],
  exports: [USER_REPOSITORY, IDENTITY_REPOSITORY, SESSION_REPOSITORY, SESSION_ID_GENERATOR],
})
export class AuthModule {}
