import type { ProjectTag } from './project-values'

export const FEED_QUERY = Symbol('FEED_QUERY')

/** PROJ-9 by default; PROJ-10 is the showcase tab, kept out of the feedback feed. */
export const FEED_SORTS = ['default', 'popular'] as const

export type FeedSort = (typeof FEED_SORTS)[number]

/** PROJ-10: upvotes inside this window are what the popular tab ranks by. */
export const POPULAR_WINDOW_DAYS = 7

export type FeedCursorKeys = {
  /** 0 = a mission is open on it, 1 = everything else (PROJ-9). */
  rank: number
  /** Whatever the sort's leading key is, as a number the cursor can carry. */
  primary: number
  secondary: number
  /** The tiebreaker of last resort, which is unique and therefore total. */
  id: string
}

export type FeedRow = {
  id: string
  ownerId: string
  title: string
  pitch: string
  tags: readonly ProjectTag[]
  coverKey: string | null
  upvoteCount: number
  /** Upvotes inside the popular window; zero outside the popular sort. */
  recentUpvotes: number
  createdAt: Date
  activeMissionId: string | null
  activeMissionSlots: number
  activeMissionOpenedAt: Date | null
  keys: FeedCursorKeys
}

export type FeedQuery = {
  page(input: {
    sort: FeedSort
    tag?: ProjectTag
    /** One account's own projects, which is what a profile page shows (AUTH-3). */
    ownerId?: string
    limit: number
    after?: FeedCursorKeys
    now?: Date
  }): Promise<FeedRow[]>
}
