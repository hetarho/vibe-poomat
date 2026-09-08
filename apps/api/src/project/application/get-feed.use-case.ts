import type { FileStorage, UserSummary, UserSummaryReader } from '../../shared/application'
import { type SlotOccupancyReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import {
  type FeedQuery,
  type FeedRow,
  type FeedSort,
  POPULAR_WINDOW_DAYS,
} from '../domain/feed.query'
import { claimableSlots } from '../domain/mission-store.repository'
import { PROJECT_TAGS, type ProjectTag } from '../domain/project-values'
import type { UpvoteRepository } from '../domain/upvote.repository'
import { decodeFeedCursor, encodeFeedCursor, type FeedCursorNotAllowedError } from './feed-cursor'
import { DELETED_USER } from './project-view'

export const FEED_PAGE_SIZE = 20
const MAX_FEED_PAGE_SIZE = 50

export type FeedCard = {
  id: string
  owner: UserSummary
  title: string
  pitch: string
  tags: readonly ProjectTag[]
  coverUrl: string | null
  upvoteCount: number
  /** Whether the caller's own vote stands, so the button renders right (PROJ-11). */
  upvotedByViewer: boolean
  /** Slots still takeable on the open mission, zero when there is none (PROJ-9). */
  claimableSlots: number
  createdAt: Date
}

export type FeedPage = {
  items: FeedCard[]
  nextCursor: string | null
}

export type GetFeedError = FeedCursorNotAllowedError

export { POPULAR_WINDOW_DAYS }

/**
 * PROJ-9 by default, PROJ-10 as the popular tab. The ordering is the database's
 * job — one query with a computed rank, not two stitched together, because
 * paginating across a union is where that design goes wrong.
 *
 * Nothing is cached (ARCH-33): correctness comes from the indexes.
 */
export class GetFeedUseCase {
  constructor(
    private readonly feed: FeedQuery,
    private readonly occupancy: SlotOccupancyReader,
    private readonly upvotes: UpvoteRepository,
    private readonly users: UserSummaryReader,
    private readonly storage: FileStorage,
  ) {}

  async execute(input: {
    sort?: FeedSort
    tag?: string
    /** One account's own projects (AUTH-3); anything unusable narrows to nothing. */
    owner?: string
    limit?: number
    cursor?: string
    viewerId?: string | null
  }): Promise<Result<FeedPage, GetFeedError>> {
    const limit = Math.min(Math.max(input.limit ?? FEED_PAGE_SIZE, 1), MAX_FEED_PAGE_SIZE)

    const after = input.cursor === undefined ? undefined : decodeFeedCursor(input.cursor)
    if (after?.isErr() === true) return err(after.error)

    // a tag that is not on the list narrows to nothing rather than being ignored,
    // which is the honest answer to a filter nobody can satisfy
    const tag = input.tag as ProjectTag | undefined
    if (tag !== undefined && !PROJECT_TAGS.includes(tag)) {
      return ok({ items: [], nextCursor: null })
    }

    // an owner nobody could be owns nothing, which is the honest answer rather
    // than quietly widening the query back to everybody's projects
    const owner = input.owner === undefined ? undefined : EntityId.parse(input.owner)
    if (owner?.isErr() === true) return ok({ items: [], nextCursor: null })

    const rows = await this.feed.page({
      sort: input.sort ?? 'default',
      tag,
      ...(owner?.isOk() === true ? { ownerId: owner.value.value } : {}),
      limit: limit + 1,
      after: after?.isOk() === true ? after.value : undefined,
    })

    const hasMore = rows.length > limit
    const page = rows.slice(0, limit)

    return ok({
      items: await this.toCards(page, input.viewerId ?? null),
      // one more than asked for is how "there is another page" is known
      nextCursor: hasMore ? encodeFeedCursor((page.at(-1) as FeedRow).keys) : null,
    })
  }

  /** Every lookup a page needs is batched: a feed must not become N queries. */
  private async toCards(rows: readonly FeedRow[], viewerId: string | null): Promise<FeedCard[]> {
    if (rows.length === 0) return []

    const viewer = viewerId === null ? null : EntityId.parse(viewerId)
    const missionIds = rows
      .map((row) => row.activeMissionId)
      .filter((id): id is string => id !== null)

    const [owners, occupancy, upvoted] = await Promise.all([
      this.users.summariesFor(rows.map((row) => row.ownerId)),
      this.occupancy.occupancyForMany(missionIds),
      viewer !== null && viewer.isOk()
        ? this.upvotes.upvotedBy(
            viewer.value,
            rows.map((row) => row.id),
          )
        : Promise.resolve(new Set<string>()),
    ])

    return rows.map((row) => ({
      id: row.id,
      owner: owners.get(row.ownerId) ?? { ...DELETED_USER, id: row.ownerId },
      title: row.title,
      pitch: row.pitch,
      tags: row.tags,
      coverUrl: row.coverKey === null ? null : this.storage.publicUrl(row.coverKey),
      upvoteCount: row.upvoteCount,
      upvotedByViewer: upvoted.has(row.id),
      claimableSlots:
        row.activeMissionId === null
          ? 0
          : claimableSlots(
              row.activeMissionSlots,
              occupancy.get(row.activeMissionId) ?? { held: 0, submitted: 0, settled: 0 },
            ),
      createdAt: row.createdAt,
    }))
  }
}
