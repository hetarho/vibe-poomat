import type { EmailTemplateName, EmailTemplateProps } from '@repo/email'

export const MAILER = Symbol('MAILER')

/**
 * The queue every send goes through (ARCH-36). Named here rather than in the
 * adapter because it is the contract between whoever enqueues an email and
 * whoever delivers it, and the enqueuers are use cases.
 */
export const SEND_EMAIL_JOB = 'email.send'

/** A template name plus its typed props — never raw HTML (ARCH-36). */
export type MailRequest<TName extends EmailTemplateName = EmailTemplateName> = {
  to: string
  template: TName
  props: EmailTemplateProps[TName]
}

export type Mailer = {
  send(request: MailRequest): Promise<void>
}
