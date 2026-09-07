import { Logger } from '@nestjs/common'
import { render } from '@repo/email'
import type { Mailer, MailRequest } from '../../application'

export type RecordedMail = {
  to: string
  subject: string
  text: string
}

/**
 * Development and test driver. It renders for real, so a broken template is
 * caught locally, and logs a preview instead of sending anything.
 */
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger(ConsoleMailer.name)
  private readonly sent: RecordedMail[] = []

  async send(request: MailRequest): Promise<void> {
    const { subject, text } = await render(request.template, request.props)
    const recorded: RecordedMail = { to: request.to, subject, text }
    this.sent.push(recorded)

    this.logger.log(`[mail] to=${request.to} subject="${subject}"\n${text}`)
  }

  /** What was "sent", for a test to read back. */
  outbox(): readonly RecordedMail[] {
    return this.sent
  }
}
