import { render as renderEmail, toPlainText } from '@react-email/render'
import { createElement } from 'react'
import type { AccountWelcomeProps } from './templates/account-welcome'
import { ACCOUNT_WELCOME_SUBJECT, AccountWelcome } from './templates/account-welcome'
import type { AutoAcceptWarningProps } from './templates/auto-accept-warning'
import { AUTO_ACCEPT_WARNING_SUBJECT, AutoAcceptWarning } from './templates/auto-accept-warning'
import type { AutoAcceptedProps } from './templates/auto-accepted'
import { AUTO_ACCEPTED_SUBJECT, AutoAccepted } from './templates/auto-accepted'
import type { FeedbackAcceptedProps } from './templates/feedback-accepted'
import { FEEDBACK_ACCEPTED_SUBJECT, FeedbackAccepted } from './templates/feedback-accepted'
import type { FeedbackReceivedProps } from './templates/feedback-received'
import { FEEDBACK_RECEIVED_SUBJECT, FeedbackReceived } from './templates/feedback-received'
import type { FeedbackRejectedProps } from './templates/feedback-rejected'
import { FEEDBACK_REJECTED_SUBJECT, FeedbackRejected } from './templates/feedback-rejected'
import type { MissionEndedProps } from './templates/mission-ended'
import { MISSION_ENDED_SUBJECT, MissionEnded } from './templates/mission-ended'
import type { ThreadReplyProps } from './templates/thread-reply'
import { THREAD_REPLY_SUBJECT, ThreadReply } from './templates/thread-reply'

/**
 * Every template, keyed by name. A name that is not here fails typecheck at the
 * call site, which is the point of the map.
 *
 * The seven notification names are exactly NOTI-2's event types, spelled the way
 * the api's `NotificationType` spells them, so a preference toggle and a template
 * can never drift apart.
 */
export type EmailTemplateProps = {
  'account-welcome': AccountWelcomeProps
  feedback_received: FeedbackReceivedProps
  thread_reply: ThreadReplyProps
  feedback_accepted: FeedbackAcceptedProps
  feedback_rejected: FeedbackRejectedProps
  auto_accept_warning: AutoAcceptWarningProps
  auto_accepted: AutoAcceptedProps
  mission_ended: MissionEndedProps
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
  feedback_received: {
    subject: () => FEEDBACK_RECEIVED_SUBJECT,
    component: FeedbackReceived,
  },
  thread_reply: {
    subject: () => THREAD_REPLY_SUBJECT,
    component: ThreadReply,
  },
  feedback_accepted: {
    subject: () => FEEDBACK_ACCEPTED_SUBJECT,
    component: FeedbackAccepted,
  },
  feedback_rejected: {
    subject: () => FEEDBACK_REJECTED_SUBJECT,
    component: FeedbackRejected,
  },
  auto_accept_warning: {
    subject: () => AUTO_ACCEPT_WARNING_SUBJECT,
    component: AutoAcceptWarning,
  },
  auto_accepted: {
    subject: () => AUTO_ACCEPTED_SUBJECT,
    component: AutoAccepted,
  },
  mission_ended: {
    subject: () => MISSION_ENDED_SUBJECT,
    component: MissionEnded,
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
