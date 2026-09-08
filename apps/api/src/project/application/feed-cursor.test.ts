import { describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import type { FeedCursorKeys } from '../domain/feed.query'
import { decodeFeedCursor, encodeFeedCursor } from './feed-cursor'

const ID = EntityId.generate().value

describe('the feed cursor', () => {
  it.each([
    ['the default feed', { rank: 0, primary: 1_767_225_600, secondary: 1_767_139_200, id: ID }],
    ['the second rank', { rank: 1, primary: 1_767_225_600, secondary: 1_767_225_600, id: ID }],
    ['the popular tab', { rank: 0, primary: 42, secondary: 137, id: ID }],
    ['a project nobody voted for', { rank: 0, primary: 0, secondary: 0, id: ID }],
  ])('round-trips %s', (_case, keys: FeedCursorKeys) => {
    expect(decodeFeedCursor(encodeFeedCursor(keys))._unsafeUnwrap()).toEqual(keys)
  })

  it('is opaque, so nothing can come to depend on the ordering of the day', () => {
    const cursor = encodeFeedCursor({ rank: 0, primary: 1, secondary: 2, id: ID })

    expect(cursor).not.toContain(ID)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('carries the sort keys rather than an offset', () => {
    const first = encodeFeedCursor({ rank: 0, primary: 10, secondary: 5, id: ID })
    const later = encodeFeedCursor({ rank: 0, primary: 9, secondary: 5, id: ID })

    // a project inserted between two requests changes no offset here, because
    // there is none to change
    expect(first).not.toBe(later)
    expect(decodeFeedCursor(first)._unsafeUnwrap().primary).toBe(10)
  })

  it.each([
    ['not base64 at all', '!!!'],
    ['too few parts', Buffer.from('0.1.2', 'utf8').toString('base64url')],
    ['keys that are not numbers', Buffer.from(`0.x.2.${ID}`, 'utf8').toString('base64url')],
    ['an id that names nothing', Buffer.from('0.1.2.nope', 'utf8').toString('base64url')],
  ])('refuses %s', (_case, cursor) => {
    expect(decodeFeedCursor(cursor)._unsafeUnwrapErr().code).toBe('FEED_CURSOR_NOT_ALLOWED')
  })

  it('refuses an id that is not a UUIDv7, because the cursor reaches a query', () => {
    const forged = Buffer.from('0.1.2.00000000-0000-4000-8000-000000000000', 'utf8').toString(
      'base64url',
    )

    expect(decodeFeedCursor(forged).isErr()).toBe(true)
  })
})
