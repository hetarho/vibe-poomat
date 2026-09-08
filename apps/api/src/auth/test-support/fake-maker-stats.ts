import type { MakerStats, MakerStatsReader } from '../../shared/application'
import { EMPTY_MAKER_STATS } from '../../shared/application'

/**
 * The feedback context's read port, stubbed. A profile test cares that FDBK-8's
 * block arrives on the response, not how the reports behind it were counted —
 * the aggregate proves itself in its own tests.
 */
export class FakeMakerStatsReader implements MakerStatsReader {
  constructor(private readonly stats = new Map<string, MakerStats>()) {}

  set(userId: string, stats: MakerStats): void {
    this.stats.set(userId, stats)
  }

  async statsFor(userId: string): Promise<MakerStats> {
    return this.stats.get(userId) ?? EMPTY_MAKER_STATS
  }
}
