/**
 * NOTI-2's event types, which are also the keys of the preference table and the
 * names of the templates. One list, so a toggle, a handler and an email can
 * never mean three different things.
 */
export const NOTIFICATION_TYPES = [
  'feedback_received',
  'thread_reply',
  'feedback_accepted',
  'feedback_rejected',
  'auto_accept_warning',
  'auto_accepted',
  'mission_ended',
] as const

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * NOTI-3: the one type nobody may switch off, because letting somebody silence
 * it would let them be surprised by a credit leaving their account.
 */
export const ALWAYS_ON_TYPE: NotificationType = 'auto_accept_warning'

export function isNotificationType(value: unknown): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType)
}

export function canBeDisabled(type: NotificationType): boolean {
  return type !== ALWAYS_ON_TYPE
}
