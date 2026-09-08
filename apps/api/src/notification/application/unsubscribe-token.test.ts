import { describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import { NOTIFICATION_TYPES } from '../domain/notification-type'
import { UnsubscribeToken } from './unsubscribe-token'

const SECRET = 'a-test-notification-secret-long-enough'
const USER = EntityId.generate().value

describe('UnsubscribeToken (NOTI-4)', () => {
  const tokens = new UnsubscribeToken(SECRET)

  describe('the round trip', () => {
    it.each(NOTIFICATION_TYPES)('carries %s back out unchanged', (type) => {
      const claim = tokens.verify(tokens.sign({ userId: USER, type }))._unsafeUnwrap()

      expect(claim).toEqual({ userId: USER, type })
    })

    it('gives a different token per type, so one link cannot disable another', () => {
      const first = tokens.sign({ userId: USER, type: 'thread_reply' })
      const second = tokens.sign({ userId: USER, type: 'mission_ended' })

      expect(first).not.toBe(second)
    })

    it('gives a different token per account', () => {
      const other = EntityId.generate().value

      expect(tokens.sign({ userId: USER, type: 'thread_reply' })).not.toBe(
        tokens.sign({ userId: other, type: 'thread_reply' }),
      )
    })

    it('is url-safe, so it survives being pasted out of a mail client', () => {
      const token = tokens.sign({ userId: USER, type: 'feedback_rejected' })

      expect(token).toMatch(/^[A-Za-z0-9._-]+$/)
    })
  })

  describe('what it refuses', () => {
    it('a token signed with another secret', () => {
      const elsewhere = new UnsubscribeToken('a-completely-different-secret-value-x')

      const outcome = tokens.verify(elsewhere.sign({ userId: USER, type: 'thread_reply' }))

      expect(outcome._unsafeUnwrapErr().code).toBe('UNSUBSCRIBE_TOKEN_NOT_ALLOWED')
    })

    /** The whole point: the payload may not be edited to name somebody else. */
    it('a payload swapped under a signature that was valid for another one', () => {
      const mine = tokens.sign({ userId: USER, type: 'thread_reply' })
      const signature = mine.split('.')[1] as string
      const theirs = Buffer.from(`${EntityId.generate().value}.thread_reply`, 'utf8').toString(
        'base64url',
      )

      expect(tokens.verify(`${theirs}.${signature}`)._unsafeUnwrapErr().code).toBe(
        'UNSUBSCRIBE_TOKEN_NOT_ALLOWED',
      )
    })

    it('a signature with one character changed', () => {
      const token = tokens.sign({ userId: USER, type: 'thread_reply' })
      const [payload, signature] = token.split('.') as [string, string]
      const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`

      expect(tokens.verify(`${payload}.${flipped}`).isErr()).toBe(true)
    })

    it('a truncated signature, rather than throwing on the length mismatch', () => {
      const token = tokens.sign({ userId: USER, type: 'thread_reply' })
      const [payload, signature] = token.split('.') as [string, string]

      expect(tokens.verify(`${payload}.${signature.slice(0, 8)}`).isErr()).toBe(true)
    })

    it.each(['', 'nonsense', 'a.b.c', '.', 'onlyonepart'])('a malformed token: %j', (token) => {
      expect(tokens.verify(token).isErr()).toBe(true)
    })

    /** A correctly signed token naming a type this build does not know. */
    it('a type that is not one of ours, even correctly signed', () => {
      const payload = Buffer.from(`${USER}.marketing_blast`, 'utf8').toString('base64url')
      const signed = new UnsubscribeToken(SECRET)
      // sign the tampered payload the way the class would, to isolate the type check
      const token = signed.sign({ userId: USER, type: 'thread_reply' })
      const signature = token.split('.')[1] as string

      expect(signed.verify(`${payload}.${signature}`).isErr()).toBe(true)
    })
  })
})
