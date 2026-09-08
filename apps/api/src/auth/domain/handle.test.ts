import { describe, expect, it } from 'vitest'
import {
  HANDLE_MAX_LENGTH,
  Handle,
  handleCandidatesFrom,
  handleSeedFrom,
  handleWithSuffix,
  RESERVED_HANDLES,
} from './handle'

function value(raw: string): string {
  const handle = Handle.create(raw)
  if (handle.isErr()) throw new Error(`expected ${raw} to be a legal handle`)

  return handle.value.value
}

describe('Handle.create', () => {
  it('lowercases, so no two accounts can differ only in case', () => {
    expect(value('AliceX')).toBe('alicex')
  })

  it('trims the surrounding whitespace a form field brings along', () => {
    expect(value('  alice  ')).toBe('alice')
  })

  it.each(['ab', 'a'.repeat(HANDLE_MAX_LENGTH + 1)])('rejects %s for its length', (raw) => {
    expect(Handle.create(raw)._unsafeUnwrapErr().code).toBe('AUTH_HANDLE_NOT_ALLOWED')
  })

  it.each(['ali ce', 'ali-ce', 'ali.ce', 'ali@ce', '앨리스'])(
    'rejects %s for its charset',
    (raw) => {
      expect(Handle.create(raw)._unsafeUnwrapErr().code).toBe('AUTH_HANDLE_NOT_ALLOWED')
    },
  )

  it('accepts digits and underscores', () => {
    expect(value('a_1')).toBe('a_1')
  })

  it.each([...RESERVED_HANDLES])('rejects the reserved handle %s', (reserved) => {
    expect(Handle.create(reserved).isErr()).toBe(true)
  })

  it('rejects a reserved handle however it was cased', () => {
    expect(Handle.create('Settings').isErr()).toBe(true)
  })

  it('is equal to another handle with the same value', () => {
    const alice = Handle.create('alice')._unsafeUnwrap()

    expect(alice.equals(Handle.create('ALICE')._unsafeUnwrap())).toBe(true)
    expect(alice.equals(Handle.create('bob')._unsafeUnwrap())).toBe(false)
  })
})

describe('handleSeedFrom', () => {
  it('drops whatever a provider username carries that a handle may not', () => {
    expect(handleSeedFrom('Ada-Lovelace.99')).toBe('adalovelace99')
  })

  it('truncates to the maximum length', () => {
    expect(handleSeedFrom('a'.repeat(50))).toHaveLength(HANDLE_MAX_LENGTH)
  })

  it.each([
    ['ab', 'userab'],
    ['', 'user'],
    ['!!', 'user'],
  ])('pads %s up to a legal length as %s', (raw, expected) => {
    expect(handleSeedFrom(raw)).toBe(expected)
  })
})

describe('handleWithSuffix', () => {
  it('appends the number', () => {
    expect(handleWithSuffix('alice', 2)._unsafeUnwrap().value).toBe('alice2')
  })

  it('truncates the body so the suffixed handle still fits', () => {
    const suffixed = handleWithSuffix('a'.repeat(HANDLE_MAX_LENGTH), 42)._unsafeUnwrap()

    expect(suffixed.value).toHaveLength(HANDLE_MAX_LENGTH)
    expect(suffixed.value.endsWith('42')).toBe(true)
  })
})

describe('handleCandidatesFrom', () => {
  it('offers the seed first, then the numeric suffixes in order (AUTH-6)', () => {
    expect(handleCandidatesFrom('alice', 4).map(String)).toEqual([
      'alice',
      'alice2',
      'alice3',
      'alice4',
    ])
  })

  it('drops a reserved seed, so the first offer is already suffixed', () => {
    expect(handleCandidatesFrom('admin', 3).map(String)).toEqual(['admin2', 'admin3', 'admin4'])
  })

  it('always produces legal handles from an unusable username', () => {
    const candidates = handleCandidatesFrom('!!', 3)

    expect(candidates.map(String)).toEqual(['user', 'user2', 'user3'])
  })

  it('returns exactly as many as asked for', () => {
    expect(handleCandidatesFrom('alice', 32)).toHaveLength(32)
  })
})
