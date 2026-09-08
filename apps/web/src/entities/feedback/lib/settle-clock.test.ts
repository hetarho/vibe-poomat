import { describe, expect, it } from 'vitest'
import {
  AUTO_ACCEPT_AFTER_HOURS,
  autoAcceptAt,
  hoursUntilAutoAccept,
  settleStage,
  WARN_AFTER_HOURS,
  warnAt,
} from './settle-clock'

const SUBMITTED = '2026-09-08T12:00:00.000Z'
const AT = Date.parse(SUBMITTED)
const HOUR = 3_600_000

describe('FDBK-7’s clock, measured from when the report came in', () => {
  it('warns the maker at 48 hours', () => {
    expect(WARN_AFTER_HOURS).toBe(48)
    expect(warnAt(SUBMITTED).toISOString()).toBe('2026-09-10T12:00:00.000Z')
  })

  it('accepts it itself at 72 hours', () => {
    expect(AUTO_ACCEPT_AFTER_HOURS).toBe(72)
    expect(autoAcceptAt(SUBMITTED).toISOString()).toBe('2026-09-11T12:00:00.000Z')
  })

  describe('which side of the markers a pending report is on', () => {
    it.each([
      ['just submitted', 0, 'plenty'],
      ['a day in', 24, 'plenty'],
      ['one hour before the warning', 47, 'plenty'],
      ['exactly at the warning', 48, 'warning'],
      ['between the two', 60, 'warning'],
      ['one hour before auto-accept', 71, 'warning'],
      ['exactly at auto-accept', 72, 'overdue'],
      ['well past it', 100, 'overdue'],
    ])('reads %s as %s', (_name, hours, stage) => {
      expect(settleStage(SUBMITTED, AT + (hours as number) * HOUR)).toBe(stage)
    })
  })

  describe('the hours a maker has left', () => {
    it('is the whole window at the start', () => {
      expect(hoursUntilAutoAccept(SUBMITTED, AT)).toBe(AUTO_ACCEPT_AFTER_HOURS)
    })

    it('rounds up, so "1h left" never means "already gone"', () => {
      expect(hoursUntilAutoAccept(SUBMITTED, AT + 71.5 * HOUR)).toBe(1)
    })

    it('is zero once the moment has passed, never negative', () => {
      expect(hoursUntilAutoAccept(SUBMITTED, AT + 100 * HOUR)).toBe(0)
    })
  })
})
