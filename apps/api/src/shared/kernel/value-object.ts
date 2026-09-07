import { isDeepStrictEqual } from 'node:util'

/** A value with no identity: two instances are the same when their props are. */
export abstract class ValueObject<TProps extends object> {
  protected constructor(protected readonly props: Readonly<TProps>) {}

  equals(other?: ValueObject<TProps> | null): boolean {
    if (other === null || other === undefined) return false
    if (other.constructor !== this.constructor) return false

    return isDeepStrictEqual(this.props, other.props)
  }
}
