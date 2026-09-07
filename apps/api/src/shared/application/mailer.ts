import type { EmailTemplateName, EmailTemplateProps } from '@repo/email'

export const MAILER = Symbol('MAILER')

/** A template name plus its typed props — never raw HTML (ARCH-36). */
export type MailRequest<TName extends EmailTemplateName = EmailTemplateName> = {
  to: string
  template: TName
  props: EmailTemplateProps[TName]
}

export type Mailer = {
  send(request: MailRequest): Promise<void>
}
