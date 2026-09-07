import { Module } from '@nestjs/common'
import { ConfigModule } from './shared/config/config.module'
import { DbModule } from './shared/db/db.module'
import { EventsModule } from './shared/events/events.module'
import { HealthModule } from './shared/health/health.module'
import { LoggerModule } from './shared/logging/logger.module'
import { PresentationModule } from './shared/presentation/presentation.module'

@Module({
  imports: [ConfigModule, LoggerModule, PresentationModule, HealthModule, EventsModule, DbModule],
})
export class AppModule {}
