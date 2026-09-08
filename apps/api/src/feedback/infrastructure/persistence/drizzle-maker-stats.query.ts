import { Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import { isRejectionReason } from '../../../shared/kernel'
import type { MakerStatsQuery, SettlementTally } from '../../domain/maker-stats.query'

type Row = { state: string; reason: string | null; count: string | number }

@Injectable()
export class DrizzleMakerStatsQuery implements MakerStatsQuery {
  /**
   * One grouped aggregate over `feedbacks` alone. `maker_id` is denormalised
   * onto the row, so counting a maker's decisions needs no reach into the
   * `project` context's tables (ARCH-14), and `feedbacks_maker_state_idx` leads
   * with exactly the two columns this filters and groups on.
   *
   * Pending reports are excluded in the `where`, not filtered afterwards: they
   * belong in neither the numerator nor the denominator, because nothing has
   * been decided about them yet.
   */
  async tallyFor(makerId: string): Promise<SettlementTally[]> {
    const { rows } = await getDb().execute<Row>(sql`
      select state, rejection_reason as reason, count(*)::int as count
      from feedbacks
      where maker_id = ${makerId}
        and state in ('accepted', 'rejected')
      group by state, rejection_reason
    `)

    return rows.map((row) => ({
      state: row.state === 'rejected' ? 'rejected' : 'accepted',
      reason: isRejectionReason(row.reason) ? row.reason : null,
      count: Number(row.count),
    }))
  }
}
