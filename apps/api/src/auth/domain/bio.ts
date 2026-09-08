import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { BioNotAllowedError } from './auth-errors'

export const BIO_MAX_LENGTH = 160

type BioProps = { value: string }

/** The optional profile blurb (AUTH-3). Absence is `null` on the user, not an empty Bio. */
export class Bio extends ValueObject<BioProps> {
  private constructor(props: BioProps) {
    super(props)
  }

  static create(raw: string): Result<Bio, BioNotAllowedError> {
    const value = raw.trim()

    if (value.length === 0) {
      return err(new BioNotAllowedError('bio is empty; clear it with null rather than a blank'))
    }

    // counted in code points, which is what varchar(160) charges for too, so an
    // emoji costs the user one character rather than two
    if ([...value].length > BIO_MAX_LENGTH) {
      return err(
        new BioNotAllowedError('bio is longer than the limit', { maxLength: BIO_MAX_LENGTH }),
      )
    }

    return ok(new Bio({ value }))
  }

  get value(): string {
    return this.props.value
  }

  override toString(): string {
    return this.props.value
  }
}
