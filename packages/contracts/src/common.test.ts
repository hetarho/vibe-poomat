import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { cursorPageSchema, entityId, errorSchema, isoDate } from './common'

describe('entityId', () => {
  it('accepts a UUIDv7', () => {
    expect(entityId.safeParse('01a07a84-ba0a-765f-99ba-d136a7396b3c').success).toBe(true)
  })

  it('rejects a UUIDv4, so a v4 id can never leak in', () => {
    expect(entityId.safeParse('9f8d1f4e-2b4a-4c1e-8b3f-2c9a1e7d4b55').success).toBe(false)
  })
})

describe('isoDate', () => {
  it('accepts an ISO-8601 instant', () => {
    expect(isoDate.safeParse('2026-09-07T10:00:00Z').success).toBe(true)
  })

  it('rejects a date without a time', () => {
    expect(isoDate.safeParse('2026-09-07').success).toBe(false)
  })
})

describe('errorSchema', () => {
  it('accepts the wire shape the api renders', () => {
    expect(errorSchema.parse({ code: 'NOT_FOUND', message: 'gone' })).toEqual({
      code: 'NOT_FOUND',
      message: 'gone',
    })
  })

  it('keeps details when they are present', () => {
    const parsed = errorSchema.parse({
      code: 'VALIDATION_FAILED',
      message: 'invalid',
      details: { title: ['required'] },
    })

    expect(parsed.details).toEqual({ title: ['required'] })
  })

  it('rejects an empty code', () => {
    expect(errorSchema.safeParse({ code: '', message: 'x' }).success).toBe(false)
  })
})

describe('cursorPageSchema', () => {
  const page = cursorPageSchema(z.object({ id: entityId }))

  it('parses a page and its cursor', () => {
    const parsed = page.parse({
      items: [{ id: '01a07a84-ba0a-765f-99ba-d136a7396b3c' }],
      nextCursor: 'abc',
    })

    expect(parsed.items).toHaveLength(1)
    expect(parsed.nextCursor).toBe('abc')
  })

  it('requires nextCursor to be present as null on the last page', () => {
    expect(page.parse({ items: [], nextCursor: null }).nextCursor).toBeNull()
    expect(page.safeParse({ items: [] }).success).toBe(false)
  })

  it('rejects an empty-string cursor, which would be indistinguishable from none', () => {
    expect(page.safeParse({ items: [], nextCursor: '' }).success).toBe(false)
  })
})
