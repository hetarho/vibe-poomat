import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { claimRefusal, FALLBACK_REFUSAL, isKnownRefusal } from './claim-refusals'

const CODES = [
  'NO_SLOTS_AVAILABLE',
  'ALREADY_CLAIMED',
  'MISSION_NOT_OPEN',
  'OWN_PROJECT',
  'CLAIM_EXPIRED',
] as const

function refusal(code: string): ApiError {
  return new ApiError(409, { code, message: 'server text nobody reads' })
}

describe('every way Start can be refused (FDBK-1, FDBK-2)', () => {
  it.each(CODES)('has its own message for %s', (code) => {
    expect(claimRefusal(refusal(code))).not.toBe(FALLBACK_REFUSAL)
    expect(isKnownRefusal(code)).toBe(true)
  })

  it('says something different for each one', () => {
    const messages = CODES.map((code) => claimRefusal(refusal(code)))

    expect(new Set(messages).size).toBe(CODES.length)
  })

  it.each([
    ['NO_SLOTS_AVAILABLE', /taken/i],
    ['ALREADY_CLAIMED', /one each/i],
    ['MISSION_NOT_OPEN', /ended/i],
    ['OWN_PROJECT', /your own project/i],
  ])('%s explains the actual situation', (code, expected) => {
    expect(claimRefusal(refusal(code))).toMatch(expected as RegExp)
  })

  it('never renders raw server text for a code it does not know', () => {
    expect(claimRefusal(refusal('SOMETHING_NEW'))).toBe(FALLBACK_REFUSAL)
    expect(isKnownRefusal('SOMETHING_NEW')).toBe(false)
  })

  it('falls back for a failure that is not the api at all', () => {
    expect(claimRefusal(new Error('offline'))).toBe(FALLBACK_REFUSAL)
  })
})
