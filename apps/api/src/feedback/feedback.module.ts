import { Global, Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CreditModule } from '../credit/credit.module'
import { ProjectModule } from '../project/project.module'
import {
  CREDIT_OPERATIONS,
  type CreditOperations,
  JOB_SCHEDULER,
  type JobScheduler,
  MISSION_READER,
  type MissionReader,
  SLOT_OCCUPANCY_READER,
  TRANSACTION_MANAGER,
  type TransactionManager,
  USER_SUMMARY_READER,
  type UserSummaryReader,
} from '../shared/application'
import { JobsModule } from '../shared/infrastructure/jobs/jobs.module'
import { ClaimSlotUseCase } from './application/claim-slot.use-case'
import { ReadFeedbackUseCase } from './application/read-feedback.use-case'
import { SettleFeedbackUseCase } from './application/settle-feedback.use-case'
import { SubmitFeedbackUseCase } from './application/submit-feedback.use-case'
import { CLAIM_REPOSITORY, type ClaimRepository } from './domain/claim.repository'
import { FEEDBACK_REPOSITORY, type FeedbackRepository } from './domain/feedback.repository'
import { DrizzleClaimRepository } from './infrastructure/persistence/drizzle-claim.repository'
import { DrizzleFeedbackRepository } from './infrastructure/persistence/drizzle-feedback.repository'
import { ReleaseSlotJob } from './infrastructure/release-slot.job'
import { AutoAcceptFeedbackJob, WarnMakerJob } from './infrastructure/settlement-timers.job'
import { ClaimsController } from './presentation/claims.controller'
import { FeedbacksController } from './presentation/feedbacks.controller'

/**
 * The claim rows, and the one question another context asks of them. Global,
 * because the project context's slot arithmetic (PROJ-6, PROJ-9) needs the
 * answer and cannot import this module without a cycle — `feedback` already
 * imports `project` to read a mission.
 */
@Global()
@Module({
  providers: [
    { provide: CLAIM_REPOSITORY, useClass: DrizzleClaimRepository },
    { provide: FEEDBACK_REPOSITORY, useClass: DrizzleFeedbackRepository },
    { provide: SLOT_OCCUPANCY_READER, useExisting: CLAIM_REPOSITORY },
  ],
  exports: [CLAIM_REPOSITORY, FEEDBACK_REPOSITORY, SLOT_OCCUPANCY_READER],
})
export class ClaimStoreModule {}

/**
 * The `feedback` bounded context (ARCH-9): who is working on what, and what they
 * turned in. It owns the claim rows, which is why it is what answers
 * `SLOT_OCCUPANCY_READER` for the project context's slot arithmetic — that
 * question crosses a boundary and so goes through a port, never a join (ARCH-14).
 */
@Module({
  imports: [AuthModule, ClaimStoreModule, CreditModule, JobsModule, ProjectModule],
  controllers: [ClaimsController, FeedbacksController],
  providers: [
    {
      provide: ClaimSlotUseCase,
      inject: [CLAIM_REPOSITORY, MISSION_READER, JOB_SCHEDULER, TRANSACTION_MANAGER],
      useFactory: (
        claims: ClaimRepository,
        missions: MissionReader,
        jobs: JobScheduler,
        transactions: TransactionManager,
      ) => new ClaimSlotUseCase(claims, missions, jobs, transactions),
    },
    {
      provide: SubmitFeedbackUseCase,
      inject: [
        CLAIM_REPOSITORY,
        FEEDBACK_REPOSITORY,
        MISSION_READER,
        USER_SUMMARY_READER,
        JOB_SCHEDULER,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        claims: ClaimRepository,
        feedbacks: FeedbackRepository,
        missions: MissionReader,
        users: UserSummaryReader,
        jobs: JobScheduler,
        transactions: TransactionManager,
      ) => new SubmitFeedbackUseCase(claims, feedbacks, missions, users, jobs, transactions),
    },
    {
      provide: ReadFeedbackUseCase,
      inject: [FEEDBACK_REPOSITORY, USER_SUMMARY_READER],
      useFactory: (feedbacks: FeedbackRepository, users: UserSummaryReader) =>
        new ReadFeedbackUseCase(feedbacks, users),
    },
    {
      provide: SettleFeedbackUseCase,
      inject: [
        FEEDBACK_REPOSITORY,
        CLAIM_REPOSITORY,
        MISSION_READER,
        CREDIT_OPERATIONS,
        USER_SUMMARY_READER,
        JOB_SCHEDULER,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        feedbacks: FeedbackRepository,
        claims: ClaimRepository,
        missions: MissionReader,
        credits: CreditOperations,
        users: UserSummaryReader,
        jobs: JobScheduler,
        transactions: TransactionManager,
      ) =>
        new SettleFeedbackUseCase(feedbacks, claims, missions, credits, users, jobs, transactions),
    },
    ReleaseSlotJob,
    WarnMakerJob,
    AutoAcceptFeedbackJob,
  ],
  exports: [
    ClaimStoreModule,
    ClaimSlotUseCase,
    SubmitFeedbackUseCase,
    ReadFeedbackUseCase,
    SettleFeedbackUseCase,
  ],
})
export class FeedbackModule {}
