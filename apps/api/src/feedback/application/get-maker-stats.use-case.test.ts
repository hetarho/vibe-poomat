import { beforeEach, describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import type { MakerStatsQuery, SettlementTally } from '../domain/maker-stats.query'
import { GetMakerStatsUseCase } from './get-maker-stats.use-case'

const MAKER = EntityId.generate().value

/**
 * Stands in for the grouped aggregate. The query proves its own SQL against a
 * real database; what is under test here is the arithmetic FDBK-8 describes.
 */
class StubTally implements MakerStatsQuery {
  readonly asked: string[] = []
  rows: SettlementTally[] = []

  async tallyFor(makerId: string): Promise<SettlementTally[]> {
    this.asked.push(makerId)

    return this.rows
  }
}

describe('GetMakerStatsUseCase (FDBK-8)', () => {
  let tally: StubTally
  let useCase: GetMakerStatsUseCase

  beforeEach(() => {
    tally = new StubTally()
    useCase = new GetMakerStatsUseCase(tally)
  })

  describe('the rate', () => {
    it('is rejections over everything that settled', async () => {
      tally.rows = [
        { state: 'accepted', reason: null, count: 3 },
        { state: 'rejected', reason: 'no_substance', count: 1 },
      ]

      const stats = await useCase.statsFor(MAKER)

      expect(stats.settledCount).toBe(4)
      expect(stats.rejectedCount).toBe(1)
      expect(stats.rejectionRate).toBe(0.25)
    })

    it('is 1 for a maker who has rejected everything', async () => {
      tally.rows = [{ state: 'rejected', reason: 'spam_abuse', count: 2 }]

      expect((await useCase.statsFor(MAKER)).rejectionRate).toBe(1)
    })

    it('is 0, not null, once something has settled and none of it was rejected', async () => {
      tally.rows = [{ state: 'accepted', reason: null, count: 5 }]

      expect((await useCase.statsFor(MAKER)).rejectionRate).toBe(0)
    })

    /** A maker with no history is not a maker who never rejects. */
    it('is null when nothing has settled at all', async () => {
      const stats = await useCase.statsFor(MAKER)

      expect(stats).toEqual({
        settledCount: 0,
        rejectedCount: 0,
        rejectionRate: null,
        reasons: { task_not_done: 0, no_substance: 0, spam_abuse: 0 },
      })
    })
  })

  describe('what counts and what does not', () => {
    /**
     * The query excludes pending rows, so the use case never sees one. This
     * pins the contract from the other side: were one to arrive, it must not
     * quietly land in the denominator.
     */
    it('never sees a pending report, because the tally is of settled ones', async () => {
      tally.rows = [{ state: 'accepted', reason: null, count: 1 }]

      expect((await useCase.statsFor(MAKER)).settledCount).toBe(1)
      expect(tally.asked).toEqual([MAKER])
    })

    /** FDBK-7: the clock accepting is still not the maker rejecting. */
    it('counts an auto-accepted report as accepted', async () => {
      tally.rows = [
        { state: 'accepted', reason: null, count: 2 },
        { state: 'rejected', reason: 'task_not_done', count: 2 },
      ]

      const stats = await useCase.statsFor(MAKER)

      expect(stats.rejectionRate).toBe(0.5)
      expect(stats.rejectedCount).toBe(2)
    })
  })

  describe('the reason distribution', () => {
    it('names every reason, including the ones nobody used', async () => {
      tally.rows = [{ state: 'rejected', reason: 'spam_abuse', count: 4 }]

      expect((await useCase.statsFor(MAKER)).reasons).toEqual({
        task_not_done: 0,
        no_substance: 0,
        spam_abuse: 4,
      })
    })

    it('adds up to the rejected count when every rejection gave a reason', async () => {
      tally.rows = [
        { state: 'accepted', reason: null, count: 1 },
        { state: 'rejected', reason: 'task_not_done', count: 2 },
        { state: 'rejected', reason: 'no_substance', count: 3 },
        { state: 'rejected', reason: 'spam_abuse', count: 1 },
      ]

      const stats = await useCase.statsFor(MAKER)
      const counted = Object.values(stats.reasons).reduce((sum, count) => sum + count, 0)

      expect(counted).toBe(stats.rejectedCount)
      expect(stats.rejectedCount).toBe(6)
      expect(stats.settledCount).toBe(7)
    })

    /** An accepted report has no reason to attribute, and must not invent one. */
    it('attributes nothing for an acceptance', async () => {
      tally.rows = [{ state: 'accepted', reason: null, count: 9 }]

      expect((await useCase.statsFor(MAKER)).reasons).toEqual({
        task_not_done: 0,
        no_substance: 0,
        spam_abuse: 0,
      })
    })

    /**
     * A rejection whose reason predates the fixed list cannot be attributed, but
     * it still happened — so it counts towards the rate and towards nothing else.
     */
    it('counts an unattributable rejection in the rate but in no category', async () => {
      tally.rows = [
        { state: 'accepted', reason: null, count: 1 },
        { state: 'rejected', reason: null, count: 1 },
      ]

      const stats = await useCase.statsFor(MAKER)

      expect(stats.rejectedCount).toBe(1)
      expect(stats.rejectionRate).toBe(0.5)
      expect(Object.values(stats.reasons).reduce((sum, count) => sum + count, 0)).toBe(0)
    })
  })

  describe('who it will answer about', () => {
    it('is empty for something that is not an account id, and asks nothing', async () => {
      const stats = await useCase.statsFor('nope')

      expect(stats.rejectionRate).toBeNull()
      expect(stats.settledCount).toBe(0)
      expect(tally.asked).toEqual([])
    })
  })
})
