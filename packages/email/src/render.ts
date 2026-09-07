import { render as renderEmail, toPlainText } from '@react-email/render'
import { createElement } from 'react'
import type { AccountWelcomeProps } from './templates/account-welcome'
import { ACCOUNT_WELCOME_SUBJECT, AccountWelcome } from './templates/account-welcome'

/**
 * Every template, keyed by name. A name that is not here fails typecheck at the
 * call site, which is the point of the map.
 */
export type EmailTemplateProps = {
  'account-welcome': AccountWelcomeProps
}

export type EmailTemplateName = keyof EmailTemplateProps

export type RenderedEmail = {
  subject: string
  html: string
  /** Mandatory for deliverability, generated from the same HTML, never hand-written. */
  text: string
}

type TemplateDefinition<TName extends EmailTemplateName> = {
  subject: (props: EmailTemplateProps[TName]) => string
  component: (props: EmailTemplateProps[TName]) => React.ReactElement
}

const TEMPLATES: { [TName in EmailTemplateName]: TemplateDefinition<TName> } = {
  'account-welcome': {
    subject: () => ACCOUNT_WELCOME_SUBJECT,
    component: AccountWelcome,
  },
}

export async function render<TName extends EmailTemplateName>(
  name: TName,
  props: EmailTemplateProps[TName],
): Promise<RenderedEmail> {
  const template = TEMPLATES[name]
  const html = await renderEmail(createElement(template.component, props), { pretty: false })

  return {
    subject: template.subject(props),
    html,
    text: toPlainText(html),
  }
}

export function templateNames(): readonly EmailTemplateName[] {
  return Object.keys(TEMPLATES) as EmailTemplateName[]
}
