import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { HandleNotAllowedError } from './auth-errors'

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 20

const HANDLE_PATTERN = /^[a-z0-9_]+$/

/**
 * Paths the router owns and a profile may therefore never claim, since AUTH-6
 * puts profiles at `/@handle` and settings pages sit beside them. A constant
 * rather than a table: it changes when the routes do, in the same commit.
 */
export const RESERVED_HANDLES: readonly string[] = [
  'admin',
  'api',
  'me',
  'settings',
  'login',
  'logout',
  'signin',
  'signup',
  'new',
  'about',
  'help',
  'support',
]

/** Used when a provider username survives sanitisation with nothing usable left. */
const SEED_FALLBACK = 'user'

type HandleProps = { value: string }

/**
 * The public name of an account (AUTH-6). Case never distinguishes two handles,
 * so the value object lowercases on the way in and the column is citext: there
 * is no code path that can produce a handle differing from another only in case.
 */
export class Handle extends ValueObject<HandleProps> {
  private constructor(props: HandleProps) {
    super(props)
  }

  static create(raw: string): Result<Handle, HandleNotAllowedError> {
    const value = raw.trim().toLowerCase()

    if (value.length < HANDLE_MIN_LENGTH || value.length > HANDLE_MAX_LENGTH) {
      return err(
        new HandleNotAllowedError('handle length is out of range', {
          minLength: HANDLE_MIN_LENGTH,
          maxLength: HANDLE_MAX_LENGTH,
        }),
      )
    }

    if (!HANDLE_PATTERN.test(value)) {
      return err(
        new HandleNotAllowedError('handle may only contain a-z, 0-9 and underscore', { value }),
      )
    }

    if (RESERVED_HANDLES.includes(value)) {
      return err(new HandleNotAllowedError('handle is reserved', { value }))
    }

    return ok(new Handle({ value }))
  }

  get value(): string {
    return this.props.value
  }

  override toString(): string {
    return this.props.value
  }
}

/**
 * Turns anything a provider gave us — a username, a display name — into a body
 * that is always a legal handle shape. It may still be reserved or taken; that
 * is what the suffix walk below is for.
 */
export function handleSeedFrom(raw: string): string {
  const stripped = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, HANDLE_MAX_LENGTH)

  if (stripped.length >= HANDLE_MIN_LENGTH) return stripped

  return `${SEED_FALLBACK}${stripped}`.slice(0, HANDLE_MAX_LENGTH)
}

/**
 * The seed with a number appended, truncated so the result still fits (AUTH-6).
 * The suffix is a digit, so the outcome can never land on a reserved word.
 */
export function handleWithSuffix(
  raw: string,
  suffix: number,
): Result<Handle, HandleNotAllowedError> {
  const seed = handleSeedFrom(raw)
  const body = seed.slice(0, HANDLE_MAX_LENGTH - String(suffix).length)

  return Handle.create(`${body}${suffix}`)
}

/** Bounds the walk below, so an unforeseen rejection cannot spin forever. */
const MAX_SUFFIX_ATTEMPTS = 1000

/**
 * What to offer, in order: the seed itself, then the seed with 2, 3, 4 …
 * appended. A reserved or otherwise illegal seed simply drops out, which is why
 * someone arriving as `admin` is offered `admin2` first.
 */
export function handleCandidatesFrom(raw: string, count: number): Handle[] {
  const seed = handleSeedFrom(raw)
  const candidates: Handle[] = []

  const first = Handle.create(seed)
  if (first.isOk()) candidates.push(first.value)

  for (let suffix = 2; candidates.length < count && suffix <= MAX_SUFFIX_ATTEMPTS; suffix++) {
    const candidate = handleWithSuffix(seed, suffix)
    if (candidate.isOk()) candidates.push(candidate.value)
  }

  return candidates
}
