import { Module } from '@nestjs/common'
import { TRANSACTION_MANAGER, type TransactionManager } from '../shared/application'
import { ConfigModule } from '../shared/config/config.module'
import { ENV, type Env } from '../shared/config/env.token'
import { OAUTH_PROVIDERS } from './application/oauth-provider'
import { SignInWithProviderUseCase } from './application/sign-in-with-provider.use-case'
import { IDENTITY_REPOSITORY, type IdentityRepository } from './domain/identity.repository'
import { SESSION_REPOSITORY, type SessionRepository } from './domain/session.repository'
import { SESSION_ID_GENERATOR, type SessionIdGenerator } from './domain/session-id-generator'
import { USER_REPOSITORY, type UserRepository } from './domain/user.repository'
import { ArcticOAuthRegistry } from './infrastructure/oauth/arctic-oauth-registry'
import { DrizzleIdentityRepository } from './infrastructure/persistence/drizzle-identity.repository'
import { DrizzleSessionRepository } from './infrastructure/persistence/drizzle-session.repository'
import { DrizzleUserRepository } from './infrastructure/persistence/drizzle-user.repository'
import { RandomSessionIdGenerator } from './infrastructure/random-session-id-generator'
import { AuthController } from './presentation/auth.controller'

/**
 * The `auth` bounded context (ARCH-9): accounts, the provider identities that
 * reach them and the sessions they hold. The ports are exported under their
 * Symbol tokens, which is the only way another context may reach in (ARCH-11).
 */
@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    { provide: USER_REPOSITORY, useClass: DrizzleUserRepository },
    { provide: IDENTITY_REPOSITORY, useClass: DrizzleIdentityRepository },
    { provide: SESSION_REPOSITORY, useClass: DrizzleSessionRepository },
    { provide: SESSION_ID_GENERATOR, useClass: RandomSessionIdGenerator },
    {
      provide: OAUTH_PROVIDERS,
      inject: [ENV],
      useFactory: (config: Env) => ArcticOAuthRegistry.create(config),
    },
    {
      // the use case knows nothing about Nest, so the module builds it
      provide: SignInWithProviderUseCase,
      inject: [
        USER_REPOSITORY,
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        SESSION_ID_GENERATOR,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        users: UserRepository,
        identities: IdentityRepository,
        sessions: SessionRepository,
        sessionIds: SessionIdGenerator,
        transactions: TransactionManager,
      ) => new SignInWithProviderUseCase(users, identities, sessions, sessionIds, transactions),
    },
  ],
  exports: [
    USER_REPOSITORY,
    IDENTITY_REPOSITORY,
    SESSION_REPOSITORY,
    SESSION_ID_GENERATOR,
    OAUTH_PROVIDERS,
  ],
})
export class AuthModule {}
