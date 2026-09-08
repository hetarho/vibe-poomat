import { Global, Module } from '@nestjs/common'
import { ProjectModule } from '../project/project.module'
import {
  JOB_SCHEDULER,
  type JobScheduler,
  MISSION_READER,
  type MissionReader,
  SLOT_OCCUPANCY_READER,
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../shared/application'
import { JobsModule } from '../shared/infrastructure/jobs/jobs.module'
import { ClaimSlotUseCase } from './application/claim-slot.use-case'
import { CLAIM_REPOSITORY, type ClaimRepository } from './domain/claim.repository'
import { DrizzleClaimRepository } from './infrastructure/persistence/drizzle-claim.repository'
import { ReleaseSlotJob } from './infrastructure/release-slot.job'
import { ClaimsController } from './presentation/claims.controller'

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
    { provide: SLOT_OCCUPANCY_READER, useExisting: CLAIM_REPOSITORY },
  ],
  exports: [CLAIM_REPOSITORY, SLOT_OCCUPANCY_READER],
})
export class ClaimStoreModule {}

/**
 * The `feedback` bounded context (ARCH-9): who is working on what, and what they
 * turned in. It owns the claim rows, which is why it is what answers
 * `SLOT_OCCUPANCY_READER` for the project context's slot arithmetic — that
 * question crosses a boundary and so goes through a port, never a join (ARCH-14).
 */
@Module({
  imports: [ClaimStoreModule, JobsModule, ProjectModule],
  controllers: [ClaimsController],
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
    ReleaseSlotJob,
  ],
  exports: [ClaimStoreModule, ClaimSlotUseCase],
})
export class FeedbackModule {}
