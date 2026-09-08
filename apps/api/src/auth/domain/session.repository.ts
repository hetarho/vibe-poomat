import type { Session } from './session'
import type { SessionId } from './session-id'

export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY')

export type SessionRepository = {
  findById(id: SessionId): Promise<Session | null>
  save(session: Session): Promise<void>
  delete(id: SessionId): Promise<void>
}
