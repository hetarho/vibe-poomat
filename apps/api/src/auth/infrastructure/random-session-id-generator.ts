import { randomBytes } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { SessionId } from '../domain/session-id'
import type { SessionIdGenerator } from '../domain/session-id-generator'

/** ARCH-18: an opaque 256-bit id, which is 43 unpadded base64url characters. */
const SESSION_ID_BYTES = 32

@Injectable()
export class RandomSessionIdGenerator implements SessionIdGenerator {
  next(): SessionId {
    const parsed = SessionId.parse(randomBytes(SESSION_ID_BYTES).toString('base64url'))
    if (parsed.isErr()) {
      // unreachable unless the constants here and in SessionId drift apart
      throw new Error(`generated session id was rejected: ${parsed.error.message}`)
    }

    return parsed.value
  }
}
