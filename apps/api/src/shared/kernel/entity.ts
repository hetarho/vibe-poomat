import type { EntityId } from './entity-id'

/** Identity, not value, decides equality: same class and same id is the same entity. */
export abstract class Entity<TProps extends object> {
  protected constructor(
    readonly id: EntityId,
    protected readonly props: TProps,
  ) {}

  equals(other?: Entity<TProps> | null): boolean {
    if (other === null || other === undefined) return false
    if (other.constructor !== this.constructor) return false

    return this.id.equals(other.id)
  }
}
