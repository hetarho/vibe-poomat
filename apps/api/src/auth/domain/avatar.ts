import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { AvatarNotAllowedError } from './auth-errors'

export const AVATAR_MAX_LENGTH = 2048

/**
 * What T014's presign mints for this purpose: `avatar/<uuid>.<ext>`. Checking
 * the prefix matters — without it a caller could hand us a key from another
 * purpose, or a path of their own choosing.
 */
const STORAGE_KEY_PATTERN = /^avatar\/[0-9a-f-]{36}\.(png|jpg|webp)$/

type AvatarProps = {
  value: string
  /** A key is resolved against object storage on read; a URL is used as-is. */
  isStorageKey: boolean
}

/**
 * A profile picture is one of two things (AUTH-3): the URL a provider prefilled
 * at signup, or the key of an object the owner uploaded (ARCH-37). One column
 * holds both, and this is the one place that knows which is which — a
 * discriminator column would double the storage for a single boolean that the
 * value already tells us.
 */
export class Avatar extends ValueObject<AvatarProps> {
  private constructor(props: AvatarProps) {
    super(props)
  }

  /** An absolute URL the provider gave us. http is allowed: MinIO is plain http locally. */
  static fromUrl(raw: string): Result<Avatar, AvatarNotAllowedError> {
    const value = raw.trim()
    if (value.length === 0 || value.length > AVATAR_MAX_LENGTH) {
      return err(new AvatarNotAllowedError('avatar url length is out of range'))
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

    return ok(new Avatar({ value: url.toString(), isStorageKey: false }))
  }

  /** A key the api itself signed an upload for; never a path a caller invented. */
  static fromStorageKey(raw: string): Result<Avatar, AvatarNotAllowedError> {
    const value = raw.trim()
    if (!STORAGE_KEY_PATTERN.test(value)) {
      return err(new AvatarNotAllowedError('not an avatar upload key', { value }))
    }

    return ok(new Avatar({ value, isStorageKey: true }))
  }

  /**
   * Rebuilds a stored value, which is a key if it has no scheme and a URL if it
   * does. Used by the row mapper and by nothing else.
   */
  static restore(raw: string): Result<Avatar, AvatarNotAllowedError> {
    return raw.includes('://') ? Avatar.fromUrl(raw) : Avatar.fromStorageKey(raw)
  }

  get value(): string {
    return this.props.value
  }

  get isStorageKey(): boolean {
    return this.props.isStorageKey
  }

  /** The key to delete when this avatar is replaced, or null for a provider URL. */
  get storageKey(): string | null {
    return this.props.isStorageKey ? this.props.value : null
  }

  override toString(): string {
    return this.props.value
  }
}
