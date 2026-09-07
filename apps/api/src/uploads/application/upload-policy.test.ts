import { describe, expect, it } from 'vitest'
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  planUpload,
  UPLOAD_PURPOSES,
} from './upload-policy'

const valid = { purpose: 'avatar', contentType: 'image/png', declaredBytes: 1024 }

describe('planUpload', () => {
  it('mints a key from the purpose and a UUIDv7, with the right extension', () => {
    const plan = planUpload(valid)._unsafeUnwrap()

    expect(plan.key).toMatch(
      /^avatar\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    )
  })

  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
  ])('maps %s to .%s', (contentType, extension) => {
    expect(
      planUpload({ ...valid, contentType })
        ._unsafeUnwrap()
        .key.endsWith(`.${extension}`),
    ).toBe(true)
  })

  it('never uses client input in the key', () => {
    const first = planUpload({ ...valid, purpose: 'project-cover' })._unsafeUnwrap()
    const second = planUpload({ ...valid, purpose: 'project-cover' })._unsafeUnwrap()

    expect(first.key).not.toBe(second.key)
    expect(first.key.startsWith('project-cover/')).toBe(true)
  })

  it.each(['image/gif', 'application/pdf', 'image/svg+xml', 'text/html'])(
    'refuses %s',
    (contentType) => {
      const plan = planUpload({ ...valid, contentType })

      expect(plan._unsafeUnwrapErr().code).toBe('UPLOAD_NOT_ALLOWED')
      expect(plan._unsafeUnwrapErr().details).toMatchObject({ allowed: ALLOWED_CONTENT_TYPES })
    },
  )

  it('refuses a purpose the server does not know', () => {
    expect(planUpload({ ...valid, purpose: 'anything' })._unsafeUnwrapErr().code).toBe(
      'UPLOAD_NOT_ALLOWED',
    )
    expect(UPLOAD_PURPOSES).toEqual(['avatar', 'project-cover'])
  })

  it('refuses a file over the 2MB cap, and says what the cap is', () => {
    const plan = planUpload({ ...valid, declaredBytes: MAX_UPLOAD_BYTES + 1 })

    expect(plan._unsafeUnwrapErr().details).toMatchObject({ maxBytes: MAX_UPLOAD_BYTES })
    expect(MAX_UPLOAD_BYTES).toBe(2 * 1024 * 1024)
  })

  it.each([0, -1, 1.5, Number.NaN])('refuses a size of %s', (declaredBytes) => {
    expect(planUpload({ ...valid, declaredBytes }).isErr()).toBe(true)
  })

  it('accepts a file exactly at the cap', () => {
    expect(planUpload({ ...valid, declaredBytes: MAX_UPLOAD_BYTES }).isOk()).toBe(true)
  })
})
