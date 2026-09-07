import { describe, expect, it } from 'vitest'
import { createUploadUrlRequestSchema, maxUploadBytes } from './uploads'

const valid = { purpose: 'avatar', contentType: 'image/png', sizeBytes: 1024 }

describe('createUploadUrlRequestSchema', () => {
  it('accepts an allowed purpose, type and size', () => {
    expect(createUploadUrlRequestSchema.parse(valid)).toEqual(valid)
  })

  it.each(['image/gif', 'application/pdf', 'text/html', 'image/svg+xml'])(
    'refuses %s',
    (contentType) => {
      expect(createUploadUrlRequestSchema.safeParse({ ...valid, contentType }).success).toBe(false)
    },
  )

  it('refuses a purpose the server does not know', () => {
    expect(
      createUploadUrlRequestSchema.safeParse({ ...valid, purpose: 'anything-goes' }).success,
    ).toBe(false)
  })

  it('refuses a size over the cap', () => {
    expect(
      createUploadUrlRequestSchema.safeParse({ ...valid, sizeBytes: maxUploadBytes + 1 }).success,
    ).toBe(false)
    expect(maxUploadBytes).toBe(2 * 1024 * 1024)
  })

  it('refuses a size that is not a positive whole number', () => {
    for (const sizeBytes of [0, -1, 1.5]) {
      expect(createUploadUrlRequestSchema.safeParse({ ...valid, sizeBytes }).success).toBe(false)
    }
  })

  it('does not let a caller propose a key', () => {
    const parsed = createUploadUrlRequestSchema.parse({ ...valid, key: 'avatar/../../etc/passwd' })

    expect('key' in parsed).toBe(false)
  })
})
