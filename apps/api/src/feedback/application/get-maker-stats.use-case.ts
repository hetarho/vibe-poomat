import type { MakerStats, MakerStatsReader } from '../../shared/application'
import { EMPTY_MAKER_STATS } from '../../shared/application'
import { EntityId, REJECTION_REASONS, type RejectionReason } from '../../shared/kernel'
import type { MakerStatsQuery } from '../domain/maker-stats.query'

/**
 * FDBK-8: the rejection rate and reason distribution on a maker's profile, which
 * is v1's only check on maker power — so it is computed from the log every time
 * rather than kept in a counter. A stale counter on a public trust signal is
 * worse than a slightly slower profile read, and the volumes here are tiny.
 *
 * The denominator is settled reports, not submissions: leaving one pending
 * cannot lower a rate, because a pending report auto-accepts at 72 hours anyway
 * (FDBK-7). An auto-accepted one counts as accepted for the same reason — the
 * maker did not reject it.
 *
 * There is no time window. FDBK-8 defines none, and a lifetime rate is the
 * harsher and simpler signal.
 */
export class GetMakerStatsUseCase implements MakerStatsReader {
  constructor(private readonly tally: MakerStatsQuery) {}

  async statsFor(userId: string): Promise<MakerStats> {
    const makerId = EntityId.parse(userId)
    // an id nobody could hold has no history, which is the same answer as a
    // maker who has never had a report settled
    if (makerId.isErr()) return EMPTY_MAKER_STATS

    const rows = await this.tally.tallyFor(makerId.value.value)

    const reasons = Object.fromEntries(REJECTION_REASONS.map((reason) => [reason, 0])) as Record<
      RejectionReason,
      number
    >
    let settledCount = 0
    let rejectedCount = 0

    for (const row of rows) {
      settledCount += row.count
      if (row.state !== 'rejected') continue

      rejectedCount += row.count
      // a rejection with no reason on the row cannot be attributed, so it counts
      // towards the rate without inventing a category for itself
      if (row.reason !== null) reasons[row.reason] += row.count
    }

    return {
      settledCount,
      rejectedCount,
      // null, not zero: a maker with no history is not one who never rejects
      rejectionRate: settledCount === 0 ? null : rejectedCount / settledCount,
      reasons,
    }
  }
}
