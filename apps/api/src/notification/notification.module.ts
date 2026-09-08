import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ProjectModule } from '../project/project.module'
import {
  JOB_SCHEDULER,
  type JobScheduler,
  NOTIFICATION_RECIPIENT_READER,
  type NotificationRecipientReader,
} from '../shared/application'
import { ConfigModule } from '../shared/config/config.module'
import { ENV, type Env } from '../shared/config/env.token'
import { JobsModule } from '../shared/infrastructure/jobs/jobs.module'
import { MailModule } from '../shared/infrastructure/mail/mail.module'
import { DeepLinks } from './application/deep-links'
import { NotificationPreferencesUseCase } from './application/notification-preferences.use-case'
import { SendNotificationUseCase } from './application/send-notification.use-case'
import { UnsubscribeToken } from './application/unsubscribe-token'
import { PREFERENCE_REPOSITORY, type PreferenceRepository } from './domain/preference.repository'
import { NOTIFICATION_HANDLERS } from './infrastructure/notification-handlers'
import { DrizzlePreferenceRepository } from './infrastructure/persistence/drizzle-preference.repository'
import { NotificationsController } from './presentation/notifications.controller'

/**
 * The `notification` bounded context (ARCH-9). It subscribes to what the other
 * contexts announce and owns no rule beyond delivery — which is exactly what
 * keeps mail out of the transaction that settles a credit (ARCH-39).
 *
 * It is the last context in the graph: everything it needs, it reaches through a
 * port, and nothing reaches back into it.
 */
@Module({
  imports: [AuthModule, ConfigModule, JobsModule, MailModule, ProjectModule],
  controllers: [NotificationsController],
  providers: [
    { provide: PREFERENCE_REPOSITORY, useClass: DrizzlePreferenceRepository },
    {
      provide: UnsubscribeToken,
      inject: [ENV],
      useFactory: (config: Env) => new UnsubscribeToken(config.NOTIFICATION_SECRET),
    },
    {
      provide: DeepLinks,
      inject: [ENV, UnsubscribeToken],
      useFactory: (config: Env, tokens: UnsubscribeToken) =>
        new DeepLinks(config.WEB_URL, config.API_URL, tokens),
    },
    {
      provide: SendNotificationUseCase,
      inject: [NOTIFICATION_RECIPIENT_READER, PREFERENCE_REPOSITORY, JOB_SCHEDULER, DeepLinks],
      useFactory: (
        recipients: NotificationRecipientReader,
        preferences: PreferenceRepository,
        jobs: JobScheduler,
        links: DeepLinks,
      ) => new SendNotificationUseCase(recipients, preferences, jobs, links),
    },
    {
      provide: NotificationPreferencesUseCase,
      inject: [PREFERENCE_REPOSITORY, UnsubscribeToken],
      useFactory: (preferences: PreferenceRepository, tokens: UnsubscribeToken) =>
        new NotificationPreferencesUseCase(preferences, tokens),
    },
    ...NOTIFICATION_HANDLERS,
  ],
  exports: [SendNotificationUseCase, NotificationPreferencesUseCase],
})
export class NotificationModule {}
