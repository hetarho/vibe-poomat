export const NOTIFICATION_RECIPIENT_READER = Symbol('NOTIFICATION_RECIPIENT_READER')

/**
 * Everything the notification context needs to address one email. The address is
 * the provider's, which AUTH-4 keeps for notifications and nothing else — which
 * is why it is not on `UserSummary`, the view every other context may hold.
 */
export type NotificationRecipient = {
  userId: string
  email: string
  displayName: string
  handle: string
}

export type NotificationRecipientReader = {
  /**
   * Null when the account is gone (AUTH-9) or never had a verified address, so a
   * job queued before a deletion exits cleanly instead of failing forever.
   */
  recipientFor(userId: string): Promise<NotificationRecipient | null>
}
