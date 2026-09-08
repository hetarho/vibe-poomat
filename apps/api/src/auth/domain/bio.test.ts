import { describe, expect, it } from 'vitest'
import { BIO_MAX_LENGTH, Bio } from './bio'

describe('Bio', () => {
  it('trims and keeps the text', () => {
    expect(Bio.create('  builds things  ')._unsafeUnwrap().value).toBe('builds things')
  })

  it('accepts exactly the limit', () => {
    expect(Bio.create('a'.repeat(BIO_MAX_LENGTH)).isOk()).toBe(true)
  })

  it('rejects one character past the limit', () => {
    expect(Bio.create('a'.repeat(BIO_MAX_LENGTH + 1))._unsafeUnwrapErr().code).toBe(
      'AUTH_BIO_NOT_ALLOWED',
    )
  })

  it('charges an emoji one character, like varchar(160) does', () => {
    expect(Bio.create('🙂'.repeat(BIO_MAX_LENGTH)).isOk()).toBe(true)
    expect(Bio.create('🙂'.repeat(BIO_MAX_LENGTH + 1)).isErr()).toBe(true)
  })

  it.each(['', '   '])('rejects %j, because clearing a bio is null', (raw) => {
    expect(Bio.create(raw).isErr()).toBe(true)
  })
})
