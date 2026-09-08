import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CreditModule } from '../credit/credit.module'
import { FeedbackModule } from '../feedback/feedback.module'
import { ProjectModule } from '../project/project.module'
import {
  ACCOUNT_ERASURE,
  type AccountErasure,
  CREDIT_OPERATIONS,
  type CreditOperations,
  FEEDBACK_PURGE,
  type FeedbackPurge,
  PROJECT_PURGE,
  type ProjectPurge,
  TRANSACTION_MANAGER,
  type TransactionManager,
  USER_SUMMARY_READER,
  type UserSummaryReader,
} from '../shared/application'
import { DeleteAccountUseCase } from './application/delete-account.use-case'
import { AccountController } from './presentation/account.controller'

/**
 * Not a bounded context — AUTH-9 is a sequence that spans four of them, and the
 * one transaction it runs in is exactly the case ARCH-38 was decided for. It
 * lives in its own module because no single context can host it: each of the
 * four would have to import the other three.
 *
 * It owns no rule and no table. Everything it does, it asks a context for
 * through that context's own port; all it contributes is the order.
 */
@Module({
  imports: [AuthModule, CreditModule, FeedbackModule, ProjectModule],
  controllers: [AccountController],
  providers: [
    {
      provide: DeleteAccountUseCase,
      inject: [
        USER_SUMMARY_READER,
        PROJECT_PURGE,
        FEEDBACK_PURGE,
        CREDIT_OPERATIONS,
        ACCOUNT_ERASURE,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        users: UserSummaryReader,
        projects: ProjectPurge,
        feedback: FeedbackPurge,
        credits: CreditOperations,
        accounts: AccountErasure,
        transactions: TransactionManager,
      ) => new DeleteAccountUseCase(users, projects, feedback, credits, accounts, transactions),
    },
  ],
  exports: [DeleteAccountUseCase],
})
export class AccountModule {}
