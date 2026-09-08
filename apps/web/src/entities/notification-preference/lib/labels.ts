import type { notifications } from '@repo/contracts'

/**
 * NOTI-2's seven types, written per event rather than derived from the key:
 * "auto-accepted" means one thing to the maker whose credit just left and
 * another to the feedbacker who just received it, and a generated label could
 * only ever be right for one of them.
 */
export const NOTIFICATION_LABELS: Readonly<Record<notifications.NotificationType, string>> = {
  feedback_received: 'Somebody left feedback on my project',
  thread_reply: 'Somebody replied in a thread I am in',
  feedback_accepted: 'My feedback was accepted',
  feedback_rejected: 'My feedback was rejected',
  auto_accept_warning: 'A report on my project decides itself in 24 hours',
  auto_accepted: 'A report was accepted automatically',
  mission_ended: 'My mission ended, with what came back',
}

/** NOTI-3, in the words the decision gives for it. */
export const ALWAYS_ON_NOTE = 'Always on — it moves your credits.'

export function labelFor(type: notifications.NotificationType): string {
  return NOTIFICATION_LABELS[type]
}
