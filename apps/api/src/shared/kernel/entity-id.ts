import { validate as isUuid, version as uuidVersion, v7 as uuidv7 } from 'uuid'
import { err, ok, type Result, ValidationError } from '../result'

const UUID_VERSION_7 = 7

/**
 * Identity of every entity: a time-ordered UUIDv7 (ARCH-14), which keeps
 * PostgreSQL's index locality intact as rows are inserted.
 */
export class EntityId {
  private constructor(readonly value: string) {}

  static generate(): EntityId {
    return new EntityId(uuidv7())
  }

  static isValid(value: string): boolean {
    return isUuid(value) && uuidVersion(value) === UUID_VERSION_7
  }

  /** Parses an id coming from outside the process, where a bad value is expected. */
  static parse(value: string): Result<EntityId, ValidationError> {
    if (!EntityId.isValid(value)) {
      return err(new ValidationError('not a UUIDv7 identifier', { value }))
    }

    return ok(new EntityId(value))
  }

  equals(other?: EntityId | null): boolean {
    if (other === null || other === undefined) return false

    return other.value === this.value
  }

  toString(): string {
    return this.value
  }
}
