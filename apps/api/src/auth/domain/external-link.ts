import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { LinkNotAllowedError } from './auth-errors'

export const EXTERNAL_LINK_MAX_LENGTH = 2048

type ExternalLinkProps = { value: string }

/**
 * The one external link a profile may carry (AUTH-3). https only: the link is
 * rendered for other people to click, and an http destination would downgrade
 * whoever clicks it.
 */
export class ExternalLink extends ValueObject<ExternalLinkProps> {
  private constructor(props: ExternalLinkProps) {
    super(props)
  }

  static create(raw: string): Result<ExternalLink, LinkNotAllowedError> {
    const value = raw.trim()

    if (value.length === 0) {
      return err(new LinkNotAllowedError('link is empty; clear it with null rather than a blank'))
    }

    if (value.length > EXTERNAL_LINK_MAX_LENGTH) {
      return err(
        new LinkNotAllowedError('link is longer than the limit', {
          maxLength: EXTERNAL_LINK_MAX_LENGTH,
        }),
      )
    }

    let url: URL
    try {
      url = new URL(value)
    } catch {
      return err(new LinkNotAllowedError('link is not a URL', { value }))
    }

    if (url.protocol !== 'https:') {
      return err(new LinkNotAllowedError('link must be an https URL', { protocol: url.protocol }))
    }

    if (url.hostname === '') {
      return err(new LinkNotAllowedError('link has no host', { value }))
    }

    // credentials in a link shown to the public are a mistake or an attack, never
    // something a profile owner meant to publish
    if (url.username !== '' || url.password !== '') {
      return err(new LinkNotAllowedError('link must not carry credentials'))
    }

    return ok(new ExternalLink({ value: url.toString() }))
  }

  get value(): string {
    return this.props.value
  }

  override toString(): string {
    return this.props.value
  }
}
