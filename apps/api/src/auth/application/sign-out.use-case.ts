import type { SessionRepository } from '../domain/session.repository'
import type { SessionId } from '../domain/session-id'

/**
 * Deleting the row is what makes signing out instant: the cookie is only ever
 * as good as the row it names (ARCH-19). Idempotent by construction — deleting
 * a row that is not there is not an error, and a browser that already signed out
 * must not be told off for saying so twice.
 */
export class SignOutUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(sessionId: SessionId | null): Promise<void> {
    if (sessionId === null) return

    await this.sessions.delete(sessionId)
  }
}
