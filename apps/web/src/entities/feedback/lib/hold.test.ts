import type { feedback } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { formatRemaining, isLapsed, occupiesSlot, remainingMs } from './hold'

const NOW = Date.parse('2026-09-08T12:00:00.000Z')

function inHours(hours: number): string {
  return new Date(NOW + hours * 3_600_000).toISOString()
}

describe('a hold, counted from the server’s held_until (FDBK-1)', () => {
  it('reads the whole 24 hours at the start', () => {
    expect(remainingMs(inHours(24), NOW)).toBe(24 * 3_600_000)
  })

  it('never goes negative, however long ago it lapsed', () => {
    expect(remainingMs(inHours(-5), NOW)).toBe(0)
  })

  it.each([
    ['in the future', 24, false],
    ['exactly now', 0, true],
    ['in the past', -1, true],
  ])('counts one %s as lapsed=%s', (_name, hours, lapsed) => {
    expect(isLapsed(inHours(hours as number), NOW)).toBe(lapsed)
  })

  describe('the words somebody reads', () => {
    it.each([
      [24 * 3_600_000, '24 hours left'],
      [3_600_000, '1 hour left'],
      [90 * 60_000, '1h 30m left'],
      [45 * 60_000, '45 minutes left'],
      [60_000, '1 minute left'],
      [30_000, 'less than a minute left'],
      [0, 'no time left'],
    ])('renders %i ms as %s', (ms, text) => {
      expect(formatRemaining(ms as number)).toBe(text)
    })
  })

  describe('what still occupies a slot', () => {
    it.each([
      ['held', true],
      ['submitted', true],
      ['settled', true],
      ['released', false],
    ])('a %s claim occupies=%s', (state, occupies) => {
      expect(occupiesSlot({ state } as feedback.Claim)).toBe(occupies)
    })
  })
})
