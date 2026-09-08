import type { RejectionReason } from '../../shared/kernel'

export const MAKER_STATS_QUERY = Symbol('MAKER_STATS_QUERY')

/** One group of the aggregate: how many reports ended this way, for this reason. */
export type SettlementTally = {
  state: 'accepted' | 'rejected'
  /** Always null on an accepted row; FDBK-6 only attaches a reason to a rejection. */
  reason: RejectionReason | null
  count: number
}

/**
 * A read model rather than a repository (ARCH-10): FDBK-8 asks for counts, and
 * loading every report of a prolific maker to count them in memory would be
 * paying for the aggregates to answer a question about none of them.
 */
export type MakerStatsQuery = {
  /** Settled reports only — pending ones have not decided anything yet. */
  tallyFor(makerId: string): Promise<SettlementTally[]>
}
