import { describe, expect, it } from 'vitest'
import {
  Cover,
  DESCRIPTION_MAX_LENGTH,
  Description,
  LiveUrl,
  MAX_TAGS,
  PITCH_MAX_LENGTH,
  Pitch,
  PROJECT_TAGS,
  Tags,
  TITLE_MAX_LENGTH,
  Title,
} from './project-values'

describe('Title', () => {
  it('trims and keeps the text', () => {
    expect(Title.create('  Poomat  ')._unsafeUnwrap().value).toBe('Poomat')
  })

  it('accepts exactly the limit', () => {
    expect(Title.create('a'.repeat(TITLE_MAX_LENGTH)).isOk()).toBe(true)
  })

  it.each(['', '   ', 'a'.repeat(TITLE_MAX_LENGTH + 1)])('refuses %j', (raw) => {
    expect(Title.create(raw)._unsafeUnwrapErr().code).toBe('PROJECT_TITLE_NOT_ALLOWED')
  })

  it('charges an emoji one character, like varchar(60) does', () => {
    expect(Title.create('🙂'.repeat(TITLE_MAX_LENGTH)).isOk()).toBe(true)
    expect(Title.create('🙂'.repeat(TITLE_MAX_LENGTH + 1)).isErr()).toBe(true)
  })
})

describe('Pitch', () => {
  it('accepts exactly the limit and refuses one past it', () => {
    expect(Pitch.create('a'.repeat(PITCH_MAX_LENGTH)).isOk()).toBe(true)
    expect(Pitch.create('a'.repeat(PITCH_MAX_LENGTH + 1))._unsafeUnwrapErr().code).toBe(
      'PROJECT_PITCH_NOT_ALLOWED',
    )
  })

  it('refuses an empty pitch, which PROJ-1 makes required', () => {
    expect(Pitch.create('  ').isErr()).toBe(true)
  })
})

describe('Description', () => {
  it('keeps markdown exactly as written, because the api never renders it', () => {
    const markdown = '# Heading\n\n<script>alert(1)</script>'

    expect(Description.create(markdown)._unsafeUnwrap().value).toBe(markdown)
  })

  it('refuses an empty one, which is null rather than a blank', () => {
    expect(Description.create('   ').isErr()).toBe(true)
  })

  it('refuses one past the limit', () => {
    expect(Description.create('a'.repeat(DESCRIPTION_MAX_LENGTH + 1)).isErr()).toBe(true)
  })
})

describe('LiveUrl (PROJ-1)', () => {
  it('accepts https and normalises it', () => {
    expect(LiveUrl.create('  https://poomat.test  ')._unsafeUnwrap().value).toBe(
      'https://poomat.test/',
    )
  })

  it.each(['http://poomat.test', 'ftp://poomat.test', 'javascript:alert(1)'])(
    'refuses %s, because a project has to open in a browser',
    (raw) => {
      expect(LiveUrl.create(raw)._unsafeUnwrapErr().code).toBe('PROJECT_URL_NOT_ALLOWED')
    },
  )

  it.each(['', 'poomat.test', 'not a url'])('refuses %j', (raw) => {
    expect(LiveUrl.create(raw).isErr()).toBe(true)
  })

  it('refuses one carrying credentials', () => {
    expect(LiveUrl.create('https://user:pass@poomat.test').isErr()).toBe(true)
  })
})

describe('Tags (PROJ-3)', () => {
  it('accepts one to three from the fixed list', () => {
    expect(Tags.create(['SaaS'])._unsafeUnwrap().values).toEqual(['SaaS'])
    expect(Tags.create(['SaaS', 'AI', 'Tool']).isOk()).toBe(true)
  })

  it.each([...PROJECT_TAGS])('accepts %s', (tag) => {
    expect(Tags.create([tag]).isOk()).toBe(true)
  })

  it('refuses none at all', () => {
    expect(Tags.create([])._unsafeUnwrapErr().code).toBe('PROJECT_TAGS_NOT_ALLOWED')
  })

  it('refuses more than the cap', () => {
    expect(Tags.create(['SaaS', 'AI', 'Tool', 'Game']).isErr()).toBe(true)
    expect(MAX_TAGS).toBe(3)
  })

  it.each(['Crypto', 'saas', ''])('refuses %j, which is not on the list', (tag) => {
    const outcome = Tags.create([tag])

    expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_TAGS_NOT_ALLOWED')
    expect(outcome._unsafeUnwrapErr().details).toMatchObject({ unknown: [tag] })
  })

  it('refuses the same tag twice, which would waste one of three', () => {
    expect(Tags.create(['SaaS', 'SaaS']).isErr()).toBe(true)
  })
})

describe('Cover', () => {
  const key = 'project-cover/01920000-0000-7000-8000-000000000001.png'

  it.each(['png', 'jpg', 'webp'])('accepts the %s key a presign minted', (extension) => {
    const candidate = key.replace('png', extension)

    expect(Cover.fromStorageKey(candidate)._unsafeUnwrap().key).toBe(candidate)
  })

  it.each([
    'avatar/01920000-0000-7000-8000-000000000001.png',
    'project-cover/../../etc/passwd',
    'project-cover/01920000-0000-7000-8000-000000000001.svg',
    'https://evil.test/a.png',
  ])('refuses %j', (raw) => {
    expect(Cover.fromStorageKey(raw)._unsafeUnwrapErr().code).toBe('PROJECT_COVER_NOT_ALLOWED')
  })
})
