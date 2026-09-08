import { describe, expect, it } from 'vitest'
import { AVATAR_MAX_LENGTH, Avatar } from './avatar'

const KEY = 'avatar/01920000-0000-7000-8000-000000000001.png'

describe('Avatar.fromUrl', () => {
  it('keeps an https URL a provider gave us', () => {
    expect(Avatar.fromUrl('https://cdn.example.com/a.png')._unsafeUnwrap().value).toBe(
      'https://cdn.example.com/a.png',
    )
  })

  it('allows http, because object storage is plain http locally', () => {
    expect(Avatar.fromUrl('http://localhost:9000/b/a.png').isOk()).toBe(true)
  })

  it.each(['', 'not a url', 'ftp://example.com/a.png', 'javascript:alert(1)'])(
    'refuses %j',
    (raw) => {
      expect(Avatar.fromUrl(raw)._unsafeUnwrapErr().code).toBe('AUTH_AVATAR_NOT_ALLOWED')
    },
  )

  it('refuses one past the length limit', () => {
    expect(Avatar.fromUrl(`https://a.test/${'x'.repeat(AVATAR_MAX_LENGTH)}`).isErr()).toBe(true)
  })

  it('is not a storage key, so nothing tries to delete it', () => {
    expect(Avatar.fromUrl('https://cdn.example.com/a.png')._unsafeUnwrap().storageKey).toBeNull()
  })
})

describe('Avatar.fromStorageKey', () => {
  it.each(['png', 'jpg', 'webp'])('accepts the %s key a presign minted', (extension) => {
    const key = KEY.replace('png', extension)

    expect(Avatar.fromStorageKey(key)._unsafeUnwrap().storageKey).toBe(key)
  })

  it.each([
    ['project-cover/01920000-0000-7000-8000-000000000001.png', 'a key from another purpose'],
    ['avatar/../../etc/passwd', 'a path of the caller’s own choosing'],
    ['avatar/01920000-0000-7000-8000-000000000001.svg', 'a type outside the allowlist'],
    ['avatar/not-a-uuid.png', 'an id we never minted'],
    ['https://evil.test/a.png', 'a URL where a key belongs'],
  ])('refuses %s — %s', (raw) => {
    expect(Avatar.fromStorageKey(raw)._unsafeUnwrapErr().code).toBe('AUTH_AVATAR_NOT_ALLOWED')
  })
})

describe('Avatar.restore', () => {
  it('reads a value with a scheme as a URL and one without as a key', () => {
    expect(Avatar.restore('https://cdn.example.com/a.png')._unsafeUnwrap().isStorageKey).toBe(false)
    expect(Avatar.restore(KEY)._unsafeUnwrap().isStorageKey).toBe(true)
  })

  it('still refuses a stored value that is neither', () => {
    expect(Avatar.restore('nonsense').isErr()).toBe(true)
  })
})
