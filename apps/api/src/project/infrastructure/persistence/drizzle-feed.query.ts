import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import {
  type FeedCursorKeys,
  type FeedQuery,
  type FeedRow,
  type FeedSort,
  POPULAR_WINDOW_DAYS,
} from '../../domain/feed.query'
import type { ProjectTag } from '../../domain/project-values'

type Row = {
  id: string
  owner_id: string
  title: string
  pitch: string
  tags: string[]
  cover_key: string | null
  upvote_count: number
  recent_upvotes: string
  created_at: string | Date
  active_mission_id: string | null
  active_mission_slots: number | null
  active_mission_opened_at: string | Date | null
  rank: number
}

function asDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

/**
 * One query per page, ordered entirely by the database.
 *
 * The rank column is what makes PROJ-9 a single statement: projects with a
 * mission open sort ahead of everything else, and the keyset cursor then walks
 * `(rank, primary, secondary, id)` in one consistent order. Stitching two
 * queries together in application code is where this design usually breaks —
 * there is no correct way to paginate across the seam.
 *
 * Nothing is cached (ARCH-33). If the popular window ever gets slow the answer
 * is a materialised rollup, not a memo.
 */
@Injectable()
export class DrizzleFeedQuery implements FeedQuery {
  async page(input: {
    sort: FeedSort
    tag?: ProjectTag
    limit: number
    after?: FeedCursorKeys
    now?: Date
  }): Promise<FeedRow[]> {
    const now = input.now ?? new Date()
    const windowStart = new Date(now.getTime() - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    const popular = input.sort === 'popular'

    // whole epoch seconds, so a timestamp and a count share the cursor's shape —
    // and so the keyset compares against exactly what the cursor carries, rather
    // than against a fraction of a second the cursor could not hold
    const primary = popular
      ? sql`coalesce(recent.recent_upvotes, 0)::bigint`
      : sql`floor(extract(epoch from coalesce(m.opened_at, p.created_at)))::bigint`
    const secondary = popular
      ? sql`p.upvote_count::bigint`
      : sql`floor(extract(epoch from p.created_at))::bigint`

    // cast, because a bare integer in ORDER BY is an ordinal position to postgres
    const rank = popular ? sql`0::int` : sql`(case when m.id is null then 1 else 0 end)::int`

    const tagFilter =
      input.tag === undefined ? sql`true` : sql`p.tags && ARRAY[${input.tag}]::text[]`

    const after = input.after
    const keyset =
      after === undefined
        ? sql`true`
        : sql`(${rank}, ${primary}, ${secondary}, p.id) <
             (${after.rank}::int, ${after.primary}::bigint, ${after.secondary}::bigint, ${after.id}::uuid)`

    const { rows } = await getDb().execute<Row>(sql`
      with recent as (
        select project_id, count(*)::int as recent_upvotes
        from upvotes
        where created_at >= ${windowStart}
        group by project_id
      )
      select
        p.id,
        p.owner_id,
        p.title,
        p.pitch,
        p.tags,
        p.cover_key,
        p.upvote_count,
        coalesce(recent.recent_upvotes, 0)::text as recent_upvotes,
        p.created_at,
        m.id as active_mission_id,
        m.slots as active_mission_slots,
        m.opened_at as active_mission_opened_at,
        ${rank} as rank
      from projects p
      left join missions m on m.project_id = p.id and m.state = 'open'
      left join recent on recent.project_id = p.id
      where p.deleted_at is null and ${tagFilter} and ${keyset}
      order by ${rank} asc, ${primary} desc, ${secondary} desc, p.id desc
      limit ${input.limit}
    `)

    return rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      title: row.title,
      pitch: row.pitch,
      tags: row.tags as ProjectTag[],
      coverKey: row.cover_key,
      upvoteCount: row.upvote_count,
      recentUpvotes: Number(row.recent_upvotes),
      createdAt: asDate(row.created_at),
      activeMissionId: row.active_mission_id,
      activeMissionSlots: row.active_mission_slots ?? 0,
      activeMissionOpenedAt:
        row.active_mission_opened_at === null ? null : asDate(row.active_mission_opened_at),
      keys: {
        rank: row.rank,
        primary: popular
          ? Number(row.recent_upvotes)
          : Math.floor(
              (row.active_mission_opened_at === null
                ? asDate(row.created_at)
                : asDate(row.active_mission_opened_at)
              ).getTime() / 1000,
            ),
        secondary: popular ? row.upvote_count : Math.floor(asDate(row.created_at).getTime() / 1000),
        id: row.id,
      },
    }))
  }
}
