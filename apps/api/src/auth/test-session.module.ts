import { type DynamicModule, Module } from '@nestjs/common'
import { env } from '@repo/config'
import { TRANSACTION_MANAGER, type TransactionManager } from '../shared/application'
import { SignInWithProviderUseCase } from './application/sign-in-with-provider.use-case'
import { AuthModule } from './auth.module'
import { IDENTITY_REPOSITORY, type IdentityRepository } from './domain/identity.repository'
import { SESSION_REPOSITORY, type SessionRepository } from './domain/session.repository'
import { SESSION_ID_GENERATOR, type SessionIdGenerator } from './domain/session-id-generator'
import { USER_REPOSITORY, type UserRepository } from './domain/user.repository'
import { TestSessionController } from './presentation/test-session.controller'

/**
 * Nothing in here reaches a production build's module graph. `forEnv` answers
 * with an empty list unless the validated env says `test`, and `AppModule`
 * spreads that — so the routes do not exist rather than existing and refusing.
 *
 * It sits in the `auth` context because issuing a session is an auth concern,
 * and because a sibling directory could not reach these repositories: a context
 * is entered through its module file only, which the layer rules enforce.
 *
 * The env comes from `@repo/config`'s validated singleton (ARCH-31) rather than
 * being read out of the process directly, and it is read at module-composition
 * time, which is before DI could hand anything the `ENV` token.
 */
@Module({
  imports: [AuthModule],
  controllers: [TestSessionController],
  providers: [
    {
      // built here from what AuthModule already exports, rather than by widening
      // that module's surface for a fixture's sake
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
})
export class TestSessionModule {
  static forEnv(nodeEnv: string = env.NODE_ENV): DynamicModule[] {
    return nodeEnv === 'test' ? [{ module: TestSessionModule }] : []
  }
}
