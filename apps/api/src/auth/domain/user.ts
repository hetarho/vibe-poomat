import { AggregateRoot, EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { AccountCreated } from './account-created.event'
import { AvatarNotAllowedError, DisplayNameNotAllowedError } from './auth-errors'
import type { Bio } from './bio'
import type { ExternalLink } from './external-link'
import type { Handle } from './handle'

export const DISPLAY_NAME_MAX_LENGTH = 50
export const AVATAR_URL_MAX_LENGTH = 2048

type UserProps = {
  handle: Handle
  displayName: string
  avatarUrl: string | null
  bio: Bio | null
  link: ExternalLink | null
  createdAt: Date
  updatedAt: Date
}

/** Absent means "leave it alone"; null means "clear it". */
export type ProfilePatch = {
  displayName?: string
  avatarUrl?: string | null
  bio?: Bio | null
  link?: ExternalLink | null
}

export type ProfileError = DisplayNameNotAllowedError | AvatarNotAllowedError

function checkDisplayName(raw: string): Result<string, DisplayNameNotAllowedError> {
  const value = raw.trim()

  if (value.length === 0) {
    return err(new DisplayNameNotAllowedError('display name is empty'))
  }

  if ([...value].length > DISPLAY_NAME_MAX_LENGTH) {
    return err(
      new DisplayNameNotAllowedError('display name is longer than the limit', {
        maxLength: DISPLAY_NAME_MAX_LENGTH,
      }),
    )
  }

  return ok(value)
}

/**
 * The avatar is either something a provider handed us or a key we signed an
 * upload for (ARCH-37), so it is checked as an absolute http(s) URL rather than
 * with the stricter https-only rule the public profile link carries: object
 * storage is plain http in local development.
 */
function checkAvatarUrl(raw: string): Result<string, AvatarNotAllowedError> {
  const value = raw.trim()

  if (value.length === 0) {
    return err(new AvatarNotAllowedError('avatar url is empty; clear it with null instead'))
  }

  if (value.length > AVATAR_URL_MAX_LENGTH) {
    return err(
      new AvatarNotAllowedError('avatar url is longer than the limit', {
        maxLength: AVATAR_URL_MAX_LENGTH,
      }),
    )
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    return err(new AvatarNotAllowedError('avatar url is not a URL', { value }))
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return err(
      new AvatarNotAllowedError('avatar url must be http or https', { protocol: url.protocol }),
    )
  }

  return ok(url.toString())
}

/**
 * An account and the public profile it is (AUTH-3). One role, always both maker
 * and feedbacker (AUTH-7), so there is nothing here to distinguish them.
 *
 * There is no `deletedAt`: AUTH-9 removes the row outright, and the other
 * contexts keep the bare id, which renders as a deleted user.
 */
export class User extends AggregateRoot<UserProps> {
  private constructor(id: EntityId, props: UserProps) {
    super(id, props)
  }

  static create(input: {
    id?: EntityId
    handle: Handle
    displayName: string
    avatarUrl?: string | null
    now?: Date
  }): Result<User, ProfileError> {
    const displayName = checkDisplayName(input.displayName)
    if (displayName.isErr()) return err(displayName.error)

    let avatarUrl: string | null = null
    if (input.avatarUrl !== undefined && input.avatarUrl !== null) {
      const checked = checkAvatarUrl(input.avatarUrl)
      if (checked.isErr()) return err(checked.error)
      avatarUrl = checked.value
    }

    const now = input.now ?? new Date()

    return ok(
      new User(input.id ?? EntityId.generate(), {
        handle: input.handle,
        displayName: displayName.value,
        avatarUrl,
        bio: null,
        link: null,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }

  /**
   * Signup, which AUTH-2 defines as the first successful sign-in. Same checks as
   * `create`, plus the event that tells the rest of the product a person now
   * exists — recorded on the aggregate so it can only reach anyone after the
   * transaction commits (ARCH-39).
   */
  static signUp(input: {
    id?: EntityId
    handle: Handle
    displayName: string
    avatarUrl?: string | null
    now?: Date
  }): Result<User, ProfileError> {
    const created = User.create(input)
    if (created.isErr()) return err(created.error)

    created.value.record(new AccountCreated(created.value.id, input.handle.value, input.now))

    return created
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: UserProps): User {
    return new User(id, { ...props })
  }

  get handle(): Handle {
    return this.props.handle
  }

  get displayName(): string {
    return this.props.displayName
  }

  get avatarUrl(): string | null {
    return this.props.avatarUrl
  }

  get bio(): Bio | null {
    return this.props.bio
  }

  get link(): ExternalLink | null {
    return this.props.link
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  rename(displayName: string, now: Date = new Date()): Result<void, DisplayNameNotAllowedError> {
    const checked = checkDisplayName(displayName)
    if (checked.isErr()) return err(checked.error)
    if (checked.value === this.props.displayName) return ok(undefined)

    this.props.displayName = checked.value
    this.props.updatedAt = now

    return ok(undefined)
  }

  /**
   * AUTH-6: the old handle is freed the moment this commits and nothing redirects
   * from it. Uniqueness is the repository's to enforce, since only the database
   * can settle a race between two people claiming the same name.
   */
  changeHandle(handle: Handle, now: Date = new Date()): void {
    if (handle.equals(this.props.handle)) return

    this.props.handle = handle
    this.props.updatedAt = now
  }

  updateProfile(patch: ProfilePatch, now: Date = new Date()): Result<void, ProfileError> {
    let avatarUrl = this.props.avatarUrl
    if (patch.avatarUrl !== undefined) {
      if (patch.avatarUrl === null) {
        avatarUrl = null
      } else {
        const checked = checkAvatarUrl(patch.avatarUrl)
        if (checked.isErr()) return err(checked.error)
        avatarUrl = checked.value
      }
    }

    let displayName = this.props.displayName
    if (patch.displayName !== undefined) {
      const checked = checkDisplayName(patch.displayName)
      if (checked.isErr()) return err(checked.error)
      displayName = checked.value
    }

    // nothing is written until every field has passed, so a rejected link cannot
    // leave a half-applied display name behind
    const bio = patch.bio === undefined ? this.props.bio : patch.bio
    const link = patch.link === undefined ? this.props.link : patch.link

    const unchanged =
      displayName === this.props.displayName &&
      avatarUrl === this.props.avatarUrl &&
      bio === this.props.bio &&
      link === this.props.link
    if (unchanged) return ok(undefined)

    this.props.displayName = displayName
    this.props.avatarUrl = avatarUrl
    this.props.bio = bio
    this.props.link = link
    this.props.updatedAt = now

    return ok(undefined)
  }
}
