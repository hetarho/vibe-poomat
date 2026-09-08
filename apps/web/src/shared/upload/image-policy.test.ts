import { describe, expect, it } from 'vitest'
import { ALLOWED_IMAGE_TYPES, checkImage, imageProblem, MAX_IMAGE_BYTES } from './image-policy'

describe('the presign policy this side mirrors (ARCH-37)', () => {
  it.each(ALLOWED_IMAGE_TYPES)('accepts a small %s', (type) => {
    expect(imageProblem({ type, size: 1024 })).toBeNull()
  })

  it('refuses a type the storage policy does not allow', () => {
    expect(imageProblem({ type: 'image/gif', size: 1024 })).not.toBeNull()
  })

  it('accepts exactly the limit and refuses one byte more', () => {
    expect(imageProblem({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull()
    expect(imageProblem({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).not.toBeNull()
  })

  it('says the limit in the unit somebody chose the file in', () => {
    expect(imageProblem({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toContain('2MB')
  })

  /** The narrowed answer is what the upload sends, so it cannot drift. */
  it('hands back the content type it accepted', () => {
    expect(checkImage({ type: 'image/webp', size: 10 })).toEqual({
      allowed: true,
      contentType: 'image/webp',
    })
  })

  it('hands back the sentence when it refuses, and no content type', () => {
    const checked = checkImage({ type: 'application/pdf', size: 10 })

    expect(checked.allowed).toBe(false)
    expect(checked).not.toHaveProperty('contentType')
  })
})
