import { REJECTION_REASONS, type RejectionReason } from '../kernel'

export const MAKER_STATS_READER = Symbol('MAKER_STATS_READER')

/**
 * FDBK-8's check on maker power: how often this account rejected the work it
 * asked for, and what it said when it did.
 *
 * `rejectionRate` is null rather than zero when nothing has settled, because a
 * maker with no history is not a maker who never rejects — the caller has to be
 * able to tell those apart.
 */
export type MakerStats = {
  settledCount: number
  rejectedCount: number
  rejectionRate: number | null
  reasons: Record<RejectionReason, number>
}

export const EMPTY_MAKER_STATS: MakerStats = {
  settledCount: 0,
  rejectedCount: 0,
  rejectionRate: null,
  reasons: Object.fromEntries(REJECTION_REASONS.map((reason) => [reason, 0])) as Record<
    RejectionReason,
    number
  >,
}

/**
 * A read another context may perform on submitted reports. It is declared here
 * for the same reason `CreditSummaryReader` is: the layering rule lets a context
 * reach another only through its module file, so the contract between them has
 * to sit where both can see it, phrased as what the consumer needs (ARCH-10).
 */
export type MakerStatsReader = {
  statsFor(userId: string): Promise<MakerStats>
}
