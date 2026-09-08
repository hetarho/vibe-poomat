import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { CreditModule } from '../credit/credit.module'
import {
  CREDIT_OPERATIONS,
  type CreditOperations,
  FILE_STORAGE,
  type FileStorage,
  HTTP_PROBE,
  type HttpProbe,
  JOB_SCHEDULER,
  type JobScheduler,
  MISSION_READER,
  PROJECT_PURGE,
  SLOT_OCCUPANCY_READER,
  type SlotOccupancyReader,
  TRANSACTION_MANAGER,
  type TransactionManager,
  USER_SUMMARY_READER,
  type UserSummaryReader,
} from '../shared/application'
import { HttpModule } from '../shared/infrastructure/http/http.module'
import { JobsModule } from '../shared/infrastructure/jobs/jobs.module'
import { StorageModule } from '../shared/infrastructure/storage/storage.module'
import { GetFeedUseCase } from './application/get-feed.use-case'
import { GetMissionsUseCase } from './application/get-missions.use-case'
import { GetProjectUseCase } from './application/get-project.use-case'
import { ManageMissionUseCase } from './application/manage-mission.use-case'
import { ManageProjectUseCase } from './application/manage-project.use-case'
import { ToggleUpvoteUseCase } from './application/toggle-upvote.use-case'
import { FEED_QUERY, type FeedQuery } from './domain/feed.query'
import { ACTIVE_MISSION_READER, type ActiveMissionReader } from './domain/mission.repository'
import { MISSION_REPOSITORY, type MissionRepository } from './domain/mission-store.repository'
import { PROJECT_REPOSITORY, type ProjectRepository } from './domain/project.repository'
import { UPVOTE_REPOSITORY, type UpvoteRepository } from './domain/upvote.repository'
import { ProjectAccountPurge } from './infrastructure/account-purge-adapter'
import { CompleteMissionOnSlotSettled } from './infrastructure/complete-mission-on-slot-settled'
import { ExpireMissionJob } from './infrastructure/expire-mission.job'
import { MissionAccessAdapter } from './infrastructure/mission-access-adapter'
import { DrizzleActiveMissions } from './infrastructure/persistence/drizzle-active-missions'
import { DrizzleFeedQuery } from './infrastructure/persistence/drizzle-feed.query'
import { DrizzleMissionRepository } from './infrastructure/persistence/drizzle-mission.repository'
import { DrizzleProjectRepository } from './infrastructure/persistence/drizzle-project.repository'
import { DrizzleUpvoteRepository } from './infrastructure/persistence/drizzle-upvote.repository'
import { FeedController } from './presentation/feed.controller'
import { MissionsController, ProjectMissionsController } from './presentation/missions.controller'
import { ProjectsController } from './presentation/projects.controller'

/**
 * The `project` bounded context (ARCH-9). Missions belong here too (PROJ-4) and
 * arrive with T023; until then `ACTIVE_MISSION_READER` answers that none is
 * running, which is exactly true while none can be opened.
 */
@Module({
  // all global, but naming them keeps the module self-sufficient: the probe
  // verifies a live url (PROJ-2), storage resolves a cover, and auth answers who
  // the owner is
  imports: [AuthModule, CreditModule, HttpModule, JobsModule, StorageModule],
  // FeedController before ProjectsController so `GET /projects` is registered
  // ahead of `GET /projects/:id`, which would otherwise read `` as an id
  controllers: [FeedController, ProjectsController, ProjectMissionsController, MissionsController],
  providers: [
    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },
    { provide: MISSION_REPOSITORY, useClass: DrizzleMissionRepository },
    { provide: FEED_QUERY, useClass: DrizzleFeedQuery },
    { provide: UPVOTE_REPOSITORY, useClass: DrizzleUpvoteRepository },
    {
      provide: GetFeedUseCase,
      inject: [
        FEED_QUERY,
        SLOT_OCCUPANCY_READER,
        UPVOTE_REPOSITORY,
        USER_SUMMARY_READER,
        FILE_STORAGE,
      ],
      useFactory: (
        feed: FeedQuery,
        occupancy: SlotOccupancyReader,
        upvotes: UpvoteRepository,
        users: UserSummaryReader,
        storage: FileStorage,
      ) => new GetFeedUseCase(feed, occupancy, upvotes, users, storage),
    },
    {
      provide: ToggleUpvoteUseCase,
      inject: [PROJECT_REPOSITORY, UPVOTE_REPOSITORY, TRANSACTION_MANAGER],
      useFactory: (
        repository: ProjectRepository,
        upvotes: UpvoteRepository,
        transactions: TransactionManager,
      ) => new ToggleUpvoteUseCase(repository, upvotes, transactions),
    },
    { provide: ACTIVE_MISSION_READER, useClass: DrizzleActiveMissions },
    {
      provide: ManageMissionUseCase,
      inject: [
        MISSION_REPOSITORY,
        PROJECT_REPOSITORY,
        SLOT_OCCUPANCY_READER,
        CREDIT_OPERATIONS,
        JOB_SCHEDULER,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        missions: MissionRepository,
        repository: ProjectRepository,
        occupancy: SlotOccupancyReader,
        credits: CreditOperations,
        jobs: JobScheduler,
        transactions: TransactionManager,
      ) => new ManageMissionUseCase(missions, repository, occupancy, credits, jobs, transactions),
    },
    ExpireMissionJob,
    MissionAccessAdapter,
    // what the feedback context may know about a mission (FDBK-1, FDBK-2)
    { provide: MISSION_READER, useExisting: MissionAccessAdapter },
    CompleteMissionOnSlotSettled,
    {
      provide: ManageProjectUseCase,
      inject: [
        PROJECT_REPOSITORY,
        ACTIVE_MISSION_READER,
        HTTP_PROBE,
        USER_SUMMARY_READER,
        FILE_STORAGE,
        TRANSACTION_MANAGER,
      ],
      useFactory: (
        repository: ProjectRepository,
        missions: ActiveMissionReader,
        probe: HttpProbe,
        users: UserSummaryReader,
        storage: FileStorage,
        transactions: TransactionManager,
      ) => new ManageProjectUseCase(repository, missions, probe, users, storage, transactions),
    },
    {
      provide: GetProjectUseCase,
      inject: [
        PROJECT_REPOSITORY,
        ACTIVE_MISSION_READER,
        USER_SUMMARY_READER,
        FILE_STORAGE,
        UPVOTE_REPOSITORY,
      ],
      useFactory: (
        repository: ProjectRepository,
        missions: ActiveMissionReader,
        users: UserSummaryReader,
        storage: FileStorage,
        upvotes: UpvoteRepository,
      ) => new GetProjectUseCase(repository, missions, users, storage, upvotes),
    },
    {
      provide: GetMissionsUseCase,
      inject: [MISSION_REPOSITORY, SLOT_OCCUPANCY_READER],
      useFactory: (repository: MissionRepository, occupancy: SlotOccupancyReader) =>
        new GetMissionsUseCase(repository, occupancy),
    },
    ProjectAccountPurge,
    // AUTH-9 asks this context for two things and nothing else
    { provide: PROJECT_PURGE, useExisting: ProjectAccountPurge },
  ],
  exports: [
    PROJECT_REPOSITORY,
    MISSION_REPOSITORY,
    ACTIVE_MISSION_READER,
    MISSION_READER,
    PROJECT_PURGE,
    ManageMissionUseCase,
  ],
})
export class ProjectModule {}
