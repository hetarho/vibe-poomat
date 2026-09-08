import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import type { EntityId } from '../../../shared/kernel'
import type { UpvoteOutcome, UpvoteRepository } from '../../domain/upvote.repository'

@Injectable()
export class DrizzleUpvoteRepository implements UpvoteRepository {
  /**
   * PROJ-11's toggle, as one statement each way plus one recount. The delete
   * runs first and its row count decides the direction, so two taps racing each
   * other end at one row rather than at two or none — the composite primary key
   * is what makes that true, not the order this code happens to run in.
   *
   * The project's count is read back from the rows rather than incremented
   * blind, so it cannot drift from what `count(*)` would say.
   */
  async toggle(projectId: EntityId, userId: EntityId): Promise<UpvoteOutcome> {
    const removed = await getDb().execute(sql`
      delete from upvotes
      where project_id = ${projectId.value} and user_id = ${userId.value}
    `)

    if (removed.rowCount === 0) {
      await getDb().execute(sql`
        insert into upvotes (project_id, user_id) values (${projectId.value}, ${userId.value})
        on conflict (project_id, user_id) do nothing
      `)
    }

    const { rows } = await getDb().execute<{ upvote_count: number; upvoted: boolean }>(sql`
      update projects set upvote_count = counted.total
      from (
        select
          count(*)::int as total,
          bool_or(user_id = ${userId.value}) as upvoted
        from upvotes where project_id = ${projectId.value}
      ) as counted
      where projects.id = ${projectId.value}
      returning projects.upvote_count, coalesce(counted.upvoted, false) as upvoted
    `)
    const row = rows[0]

    return {
      upvoted: row?.upvoted ?? false,
      upvoteCount: Number(row?.upvote_count ?? 0),
    }
  }

  /** One query for a whole page, so a feed never becomes a vote lookup per card. */
  async upvotedBy(userId: EntityId, projectIds: readonly string[]): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set()

    const { rows } = await getDb().execute<{ project_id: string }>(sql`
      select project_id from upvotes
      where user_id = ${userId.value}
        and project_id = any(${sql`ARRAY[${sql.join(
          projectIds.map((id) => sql`${id}`),
          sql`, `,
        )}]::uuid[]`})
    `)

    return new Set(rows.map((row) => row.project_id))
  }

  async countFor(projectId: EntityId): Promise<number> {
    const { rows } = await getDb().execute<{ total: string }>(sql`
      select count(*)::text as total from upvotes where project_id = ${projectId.value}
    `)

    return Number(rows[0]?.total ?? '0')
  }
}
