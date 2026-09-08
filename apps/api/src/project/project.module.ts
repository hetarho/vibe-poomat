import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import {
  FILE_STORAGE,
  type FileStorage,
  HTTP_PROBE,
  type HttpProbe,
  TRANSACTION_MANAGER,
  type TransactionManager,
  USER_SUMMARY_READER,
  type UserSummaryReader,
} from '../shared/application'
import { HttpModule } from '../shared/infrastructure/http/http.module'
import { StorageModule } from '../shared/infrastructure/storage/storage.module'
import { GetProjectUseCase } from './application/get-project.use-case'
import { ManageProjectUseCase } from './application/manage-project.use-case'
import { ACTIVE_MISSION_READER, type ActiveMissionReader } from './domain/mission.repository'
import { PROJECT_REPOSITORY, type ProjectRepository } from './domain/project.repository'
import { NoActiveMissions } from './infrastructure/no-active-missions'
import { DrizzleProjectRepository } from './infrastructure/persistence/drizzle-project.repository'
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
  imports: [AuthModule, HttpModule, StorageModule],
  controllers: [ProjectsController],
  providers: [
    { provide: PROJECT_REPOSITORY, useClass: DrizzleProjectRepository },
    { provide: ACTIVE_MISSION_READER, useClass: NoActiveMissions },
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
      inject: [PROJECT_REPOSITORY, ACTIVE_MISSION_READER, USER_SUMMARY_READER, FILE_STORAGE],
      useFactory: (
        repository: ProjectRepository,
        missions: ActiveMissionReader,
        users: UserSummaryReader,
        storage: FileStorage,
      ) => new GetProjectUseCase(repository, missions, users, storage),
    },
  ],
  exports: [PROJECT_REPOSITORY, ACTIVE_MISSION_READER],
})
export class ProjectModule {}
