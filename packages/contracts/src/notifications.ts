import { z } from 'zod'

/**
 * NOTI-2's event types. The same seven strings key the preference rows and name
 * the templates, so a toggle in settings and an email in an inbox always mean
 * the same thing.
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

export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)

export type NotificationType = z.infer<typeof notificationTypeSchema>

export const notificationPreferenceSchema = z.object({
  type: notificationTypeSchema,
  enabled: z.boolean(),
  /** NOTI-3: false for the auto-accept warning, which moves credits. */
  canDisable: z.boolean(),
})

export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>

export const notificationPreferencesSchema = z.object({
  items: z.array(notificationPreferenceSchema),
})

export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>

/**
 * A partial update: an absent type is left alone. Disabling the always-on type
 * is refused by the api rather than silently ignored, so a client that tries
 * learns that it did.
 */
export const updateNotificationPreferencesRequestSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_TYPES.map((type) => [type, z.boolean()])) as Record<
      NotificationType,
      z.ZodBoolean
    >,
  )
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'change at least one type' })

export type UpdateNotificationPreferencesRequest = z.infer<
  typeof updateNotificationPreferencesRequestSchema
>
