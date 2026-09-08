export const USER_SUMMARY_READER = Symbol('USER_SUMMARY_READER')

/** As much of an account as a card needs: who posted this, and nothing private. */
export type UserSummary = {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
}

/**
 * The `auth` context's answer to "who is this", published here for the same
 * reason the credit summary is: a context may reach another only through its
 * module file, so the contract between them has to sit where both can see it
 * (ARCH-10). No private field is reachable through it (AUTH-4).
 */
export type UserSummaryReader = {
  summaryFor(userId: string): Promise<UserSummary | null>
  /** One query for a page of cards, so a feed never becomes N of them. */
  summariesFor(userIds: readonly string[]): Promise<Map<string, UserSummary>>
}
