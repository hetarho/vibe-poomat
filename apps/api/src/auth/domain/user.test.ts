import { describe, expect, it } from 'vitest'
import { Bio } from './bio'
import { ExternalLink } from './external-link'
import { Handle } from './handle'
import { DISPLAY_NAME_MAX_LENGTH, User } from './user'

const START = new Date('2026-01-01T00:00:00.000Z')
const LATER = new Date('2026-02-01T00:00:00.000Z')

function handle(raw: string): Handle {
  return Handle.create(raw)._unsafeUnwrap()
}

function user(displayName = 'Ada Lovelace'): User {
  return User.create({ handle: handle('ada'), displayName, now: START })._unsafeUnwrap()
}

describe('User.create', () => {
  it('starts as a public profile with nothing optional filled in', () => {
    const created = user()

    expect(created.handle.value).toBe('ada')
    expect(created.displayName).toBe('Ada Lovelace')
    expect(created.avatarUrl).toBeNull()
    expect(created.bio).toBeNull()
    expect(created.link).toBeNull()
    expect(created.createdAt).toEqual(START)
  })

  it('takes the avatar the provider prefilled (AUTH-3)', () => {
    const created = User.create({
      handle: handle('ada'),
      displayName: 'Ada',
      avatarUrl: 'https://cdn.example.com/a.png',
    })._unsafeUnwrap()

    expect(created.avatarUrl).toBe('https://cdn.example.com/a.png')
  })

  it.each(['', '   ', 'a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1)])(
    'rejects %j as a display name',
    (displayName) => {
      expect(User.create({ handle: handle('ada'), displayName })._unsafeUnwrapErr().code).toBe(
        'AUTH_DISPLAY_NAME_NOT_ALLOWED',
      )
    },
  )

  it.each(['not a url', 'ftp://example.com/a.png'])('rejects %j as an avatar', (avatarUrl) => {
    expect(
      User.create({ handle: handle('ada'), displayName: 'Ada', avatarUrl })._unsafeUnwrapErr().code,
    ).toBe('AUTH_AVATAR_NOT_ALLOWED')
  })

  it('allows an http avatar, because object storage is plain http locally', () => {
    expect(
      User.create({
        handle: handle('ada'),
        displayName: 'Ada',
        avatarUrl: 'http://localhost:9000/vibe-poomat/a.png',
      }).isOk(),
    ).toBe(true)
  })
})

describe('User.rename', () => {
  it('trims and records when it happened', () => {
    const target = user()

    expect(target.rename('  Ada L  ', LATER).isOk()).toBe(true)
    expect(target.displayName).toBe('Ada L')
    expect(target.updatedAt).toEqual(LATER)
  })

  it('leaves updated_at alone when the name did not actually change', () => {
    const target = user()

    expect(target.rename('Ada Lovelace', LATER).isOk()).toBe(true)
    expect(target.updatedAt).toEqual(START)
  })

  it('refuses an empty name and changes nothing', () => {
    const target = user()

    expect(target.rename('   ', LATER).isErr()).toBe(true)
    expect(target.displayName).toBe('Ada Lovelace')
    expect(target.updatedAt).toEqual(START)
  })
})

describe('User.changeHandle', () => {
  it('takes the new handle and records when it happened (AUTH-6)', () => {
    const target = user()

    target.changeHandle(handle('ada_l'), LATER)

    expect(target.handle.value).toBe('ada_l')
    expect(target.updatedAt).toEqual(LATER)
  })

  it('is a no-op when the handle only differs in case, since Handle lowercased it', () => {
    const target = user()

    target.changeHandle(handle('ADA'), LATER)

    expect(target.handle.value).toBe('ada')
    expect(target.updatedAt).toEqual(START)
  })
})

describe('User.updateProfile', () => {
  it('leaves an absent field alone and clears one passed as null', () => {
    const target = user()
    target.updateProfile(
      {
        bio: Bio.create('builds things')._unsafeUnwrap(),
        link: ExternalLink.create('https://a.test')._unsafeUnwrap(),
      },
      LATER,
    )

    expect(target.updateProfile({ bio: null }, LATER).isOk()).toBe(true)

    expect(target.bio).toBeNull()
    expect(target.link?.value).toBe('https://a.test/')
    expect(target.displayName).toBe('Ada Lovelace')
  })

  it('applies nothing when one field is rejected', () => {
    const target = user()

    const result = target.updateProfile({ displayName: 'Ada L', avatarUrl: 'nope' }, LATER)

    expect(result._unsafeUnwrapErr().code).toBe('AUTH_AVATAR_NOT_ALLOWED')
    expect(target.displayName).toBe('Ada Lovelace')
    expect(target.updatedAt).toEqual(START)
  })

  it('leaves updated_at alone when the patch changes nothing', () => {
    const target = user()

    expect(target.updateProfile({ displayName: 'Ada Lovelace' }, LATER).isOk()).toBe(true)
    expect(target.updatedAt).toEqual(START)
  })
})
