import { describe, expect, it } from 'vitest'
import { READ_THROTTLER, throttlerPolicy, trackerFor, WRITE_THROTTLER } from './throttler-policy'

describe('the throttler policy', () => {
  it('has a loose bucket for reads and a strict one for writes', () => {
    const byName = new Map(throttlerPolicy.map((entry) => [entry.name, entry]))

    expect(byName.get(READ_THROTTLER)?.limit).toBeGreaterThan(
      Number(byName.get(WRITE_THROTTLER)?.limit),
    )
    expect(byName.get(WRITE_THROTTLER)?.blockDuration).toBeGreaterThan(0)
  })
})

describe('trackerFor', () => {
  it('counts against the signed-in user, not their address', () => {
    expect(trackerFor({ user: { id: 'user-7' }, ip: '203.0.113.1' })).toBe('user:user-7')
  })

  it('falls back to the client address Fastify resolved', () => {
    expect(trackerFor({ ip: '203.0.113.1' })).toBe('ip:203.0.113.1')
  })

  it('still produces a key when there is neither', () => {
    expect(trackerFor({})).toBe('ip:unknown')
  })

  it('ignores an empty user id rather than keying on it', () => {
    expect(trackerFor({ user: { id: '' }, ip: '203.0.113.1' })).toBe('ip:203.0.113.1')
  })
})
