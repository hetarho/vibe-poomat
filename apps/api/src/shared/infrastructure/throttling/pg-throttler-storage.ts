import { Injectable } from '@nestjs/common'
import type { ThrottlerStorage } from '@nestjs/throttler'
import { sql } from 'drizzle-orm'
import { getDb } from '../../db/db-context'

// the record interface is not re-exported from the package root, so it is derived
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>

/**
 * One statement per request: it opens a window if there is none, expires a stale
 * one, counts the hit, and starts a block when the limit is passed. Doing it in
 * a single upsert is what keeps two concurrent requests from both "being first".
 */
@Injectable()
export class PgThrottlerStorage implements ThrottlerStorage {
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const row = `${throttlerName}:${key}`
    const result = await getDb().execute<{
      hits: number
      time_to_expire: number
      is_blocked: boolean
      time_to_block_expire: number
    }>(sql`
      with upserted as (
        insert into rate_limits (key, hits, expires_at, blocked_until)
        values (${row}, 1, now() + make_interval(secs => ${ttl}), null)
        on conflict (key) do update set
          hits = case
            when rate_limits.expires_at <= now() then 1
            else rate_limits.hits + 1
          end,
          expires_at = case
            when rate_limits.expires_at <= now() then now() + make_interval(secs => ${ttl})
            else rate_limits.expires_at
          end,
          blocked_until = case
            when rate_limits.blocked_until is not null and rate_limits.blocked_until > now()
              then rate_limits.blocked_until
            when rate_limits.expires_at > now() and rate_limits.hits + 1 > ${limit}
              then now() + make_interval(secs => ${blockDuration})
            else null
          end
        returning hits, expires_at, blocked_until
      )
      select
        hits,
        greatest(0, ceil(extract(epoch from (expires_at - now()))))::int as time_to_expire,
        (blocked_until is not null and blocked_until > now()) as is_blocked,
        coalesce(greatest(0, ceil(extract(epoch from (blocked_until - now())))), 0)::int
          as time_to_block_expire
      from upserted
    `)

    const record = result.rows[0]

    return {
      totalHits: Number(record?.hits ?? 1),
      timeToExpire: Number(record?.time_to_expire ?? ttl),
      isBlocked: record?.is_blocked === true,
      timeToBlockExpire: Number(record?.time_to_block_expire ?? 0),
    }
  }
}
