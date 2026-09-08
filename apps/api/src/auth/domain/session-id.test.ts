import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SESSION_ID_LENGTH, SessionId } from './session-id'

describe('SessionId.parse', () => {
  it('accepts what the generator produces', () => {
    const raw = randomBytes(32).toString('base64url')

    expect(raw).toHaveLength(SESSION_ID_LENGTH)
    expect(SessionId.parse(raw)._unsafeUnwrap().value).toBe(raw)
  })

  it.each(['', 'short', 'a'.repeat(65)])('rejects %j for its length', (raw) => {
    expect(SessionId.parse(raw)._unsafeUnwrapErr().code).toBe('AUTH_SESSION_ID_NOT_ALLOWED')
  })

  it('rejects anything outside base64url, so junk never reaches a query', () => {
    expect(SessionId.parse(`${'a'.repeat(42)}+`).isErr()).toBe(true)
  })
})
