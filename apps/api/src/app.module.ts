import { Module } from '@nestjs/common'
import { ConfigModule } from './shared/config/config.module'
import { DbModule } from './shared/db/db.module'
import { EventsModule } from './shared/events/events.module'
import { HealthModule } from './shared/health/health.module'
import { HttpModule } from './shared/infrastructure/http/http.module'
import { JobsModule } from './shared/infrastructure/jobs/jobs.module'
import { MailModule } from './shared/infrastructure/mail/mail.module'
import { StorageModule } from './shared/infrastructure/storage/storage.module'
import { ThrottlingModule } from './shared/infrastructure/throttling/throttling.module'
import { LoggerModule } from './shared/logging/logger.module'
import { PresentationModule } from './shared/presentation/presentation.module'
import { UploadsModule } from './uploads/uploads.module'

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PresentationModule,
    HealthModule,
    EventsModule,
    DbModule,
    JobsModule,
    MailModule,
    HttpModule,
    ThrottlingModule,
    StorageModule,
    UploadsModule,
  ],
})
export class AppModule {}
