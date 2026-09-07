import { Global, Module } from '@nestjs/common'
import type PgBoss from 'pg-boss'
import { JOB_SCHEDULER } from '../../application'
import { ConfigModule } from '../../config/config.module'
import { JobRegistry } from './job-registry'
import { PgBossService } from './pg-boss.service'
import { PgBossJobScheduler } from './pg-boss-job-scheduler'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    JobRegistry,
    PgBossService,
    {
      provide: JOB_SCHEDULER,
      inject: [PgBossService, JobRegistry],
      useFactory: (service: PgBossService, registry: JobRegistry) =>
        new PgBossJobScheduler(service.instance() as PgBoss, registry),
    },
  ],
  exports: [JobRegistry, JOB_SCHEDULER, PgBossService],
})
export class JobsModule {}
