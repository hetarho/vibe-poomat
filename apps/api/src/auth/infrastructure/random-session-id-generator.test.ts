import { describe, expect, it } from 'vitest'
import { SESSION_ID_LENGTH, SessionId } from '../domain/session-id'
import { RandomSessionIdGenerator } from './random-session-id-generator'

describe('RandomSessionIdGenerator', () => {
  const generator = new RandomSessionIdGenerator()

  it('mints a 256-bit opaque id that SessionId accepts (ARCH-18)', () => {
    const id = generator.next()

    expect(id.value).toHaveLength(SESSION_ID_LENGTH)
    expect(SessionId.parse(id.value).isOk()).toBe(true)
  })

  it('never repeats itself', () => {
    const minted = new Set(Array.from({ length: 1000 }, () => generator.next().value))

    expect(minted.size).toBe(1000)
  })
})
