import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import {
  CoverNotAllowedError,
  DescriptionNotAllowedError,
  LiveUrlNotAllowedError,
  PitchNotAllowedError,
  TagsNotAllowedError,
  TitleNotAllowedError,
} from './project-errors'

export const TITLE_MAX_LENGTH = 60
export const PITCH_MAX_LENGTH = 200
export const DESCRIPTION_MAX_LENGTH = 10_000
export const LIVE_URL_MAX_LENGTH = 2048
export const MAX_TAGS = 3

/** PROJ-3, fixed so the feed filter cannot fragment. Mirrored in @repo/contracts. */
export const PROJECT_TAGS = [
  'SaaS',
  'Tool',
  'Game',
  'AI',
  'Social',
  'Productivity',
  'Other',
] as const

export type ProjectTag = (typeof PROJECT_TAGS)[number]

/** The key shape T014's presign mints for this purpose. */
const COVER_KEY_PATTERN = /^project-cover\/[0-9a-f-]{36}\.(png|jpg|webp)$/

function trimmedWithin(
  raw: string,
  maxLength: number,
): { value: string; tooLong: boolean; empty: boolean } {
  const value = raw.trim()

  // code points, not UTF-16 units, so an emoji costs what varchar charges
  return { value, tooLong: [...value].length > maxLength, empty: value.length === 0 }
}

export class Title extends ValueObject<{ value: string }> {
  private constructor(props: { value: string }) {
    super(props)
  }

  static create(raw: string): Result<Title, TitleNotAllowedError> {
    const { value, tooLong, empty } = trimmedWithin(raw, TITLE_MAX_LENGTH)
    if (empty) return err(new TitleNotAllowedError('title is empty'))
    if (tooLong) {
      return err(
        new TitleNotAllowedError('title is longer than the limit', { maxLength: TITLE_MAX_LENGTH }),
      )
    }

    return ok(new Title({ value }))
  }

  get value(): string {
    return this.props.value
  }
}

export class Pitch extends ValueObject<{ value: string }> {
  private constructor(props: { value: string }) {
    super(props)
  }

  static create(raw: string): Result<Pitch, PitchNotAllowedError> {
    const { value, tooLong, empty } = trimmedWithin(raw, PITCH_MAX_LENGTH)
    if (empty) return err(new PitchNotAllowedError('pitch is empty'))
    if (tooLong) {
      return err(
        new PitchNotAllowedError('pitch is longer than the limit', { maxLength: PITCH_MAX_LENGTH }),
      )
    }

    return ok(new Pitch({ value }))
  }

  get value(): string {
    return this.props.value
  }
}

/**
 * Markdown, stored exactly as it was written. Nothing here turns it into HTML:
 * rendering happens once in the web layer with a sanitising renderer, so there
 * is a single place where an XSS could be introduced and a single place to fix it.
 */
export class Description extends ValueObject<{ value: string }> {
  private constructor(props: { value: string }) {
    super(props)
  }

  static create(raw: string): Result<Description, DescriptionNotAllowedError> {
    const { value, tooLong, empty } = trimmedWithin(raw, DESCRIPTION_MAX_LENGTH)
    if (empty) {
      return err(new DescriptionNotAllowedError('description is empty; clear it with null instead'))
    }
    if (tooLong) {
      return err(
        new DescriptionNotAllowedError('description is longer than the limit', {
          maxLength: DESCRIPTION_MAX_LENGTH,
        }),
      )
    }

    return ok(new Description({ value }))
  }

  get value(): string {
    return this.props.value
  }
}

/**
 * PROJ-1: https and nothing else. Whether it can actually be reached is a
 * separate question, answered by the probe (ARCH-40) — this only decides whether
 * it is the kind of thing worth asking about.
 */
export class LiveUrl extends ValueObject<{ value: string }> {
  private constructor(props: { value: string }) {
    super(props)
  }

  static create(raw: string): Result<LiveUrl, LiveUrlNotAllowedError> {
    const value = raw.trim()
    if (value.length === 0 || value.length > LIVE_URL_MAX_LENGTH) {
      return err(new LiveUrlNotAllowedError('live url length is out of range'))
    }

    let url: URL
    try {
      url = new URL(value)
    } catch {
      return err(new LiveUrlNotAllowedError('live url is not a URL', { value }))
    }

    if (url.protocol !== 'https:') {
      return err(new LiveUrlNotAllowedError('live url must be https', { protocol: url.protocol }))
    }
    if (url.hostname === '') return err(new LiveUrlNotAllowedError('live url has no host'))
    if (url.username !== '' || url.password !== '') {
      return err(new LiveUrlNotAllowedError('live url must not carry credentials'))
    }

    return ok(new LiveUrl({ value: url.toString() }))
  }

  get value(): string {
    return this.props.value
  }
}

/** PROJ-3: one to three of the fixed list, each at most once. */
export class Tags extends ValueObject<{ values: readonly ProjectTag[] }> {
  private constructor(props: { values: readonly ProjectTag[] }) {
    super(props)
  }

  static create(raw: readonly string[]): Result<Tags, TagsNotAllowedError> {
    if (raw.length === 0) return err(new TagsNotAllowedError('at least one tag is required'))
    if (raw.length > MAX_TAGS) {
      return err(new TagsNotAllowedError('too many tags', { maxTags: MAX_TAGS }))
    }

    const unknown = raw.filter((tag) => !PROJECT_TAGS.includes(tag as ProjectTag))
    if (unknown.length > 0) {
      return err(
        new TagsNotAllowedError('tag is not on the list', { unknown, allowed: PROJECT_TAGS }),
      )
    }

    const values = raw as readonly ProjectTag[]
    if (new Set(values).size !== values.length) {
      return err(new TagsNotAllowedError('tags must not repeat'))
    }

    return ok(new Tags({ values }))
  }

  get values(): readonly ProjectTag[] {
    return this.props.values
  }
}

/** Only ever a key we signed an upload for — a project cover has no other source. */
export class Cover extends ValueObject<{ key: string }> {
  private constructor(props: { key: string }) {
    super(props)
  }

  static fromStorageKey(raw: string): Result<Cover, CoverNotAllowedError> {
    const key = raw.trim()
    if (!COVER_KEY_PATTERN.test(key)) {
      return err(new CoverNotAllowedError('not a project cover upload key', { key }))
    }

    return ok(new Cover({ key }))
  }

  get key(): string {
    return this.props.key
  }
}
