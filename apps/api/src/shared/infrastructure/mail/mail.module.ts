import { Global, Module } from '@nestjs/common'
import { MAILER } from '../../application'
import { ConfigModule } from '../../config/config.module'
import { ENV, type Env } from '../../config/env.token'
import { ConsoleMailer } from './console-mailer'
import { ResendMailer } from './resend-mailer'
import { SendEmailJob } from './send-email.job'

/** The driver is chosen here, once, never by a branch inside a use case. */
export function mailerFor(config: Env): ConsoleMailer | ResendMailer {
  if (config.MAIL_DRIVER === 'console' || config.RESEND_API_KEY === undefined) {
    return new ConsoleMailer()
  }

  return new ResendMailer({
    apiKey: config.RESEND_API_KEY,
    from: config.MAIL_FROM,
    fromName: config.MAIL_FROM_NAME,
  })
}

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: MAILER, inject: [ENV], useFactory: (config: Env) => mailerFor(config) },
    SendEmailJob,
  ],
  exports: [MAILER, SendEmailJob],
})
export class MailModule {}
