import { err, ok, type Result, UnauthorizedError } from '../../shared/result'
import type { Session } from '../domain/session'
import type { SessionRepository } from '../domain/session.repository'
import type { SessionId } from '../domain/session-id'

/** The one failure this can produce, whatever went wrong; the cookie is opaque. */
export class UnauthenticatedError extends UnauthorizedError {
  override readonly code = 'UNAUTHENTICATED'
}

export type AuthenticatedCaller = {
  /** The account id, as a plain string: the guard puts it on the request. */
  userId: string
}

/**
 * What the guard does on every request: turn a cookie into an account, or into
 * a 401. A lapsed row is refused rather than swept here — the hourly job
 * reclaims it — because a request must never wait on a delete.
 */
export class AuthenticateSessionUseCase {
  constructor(private readonly sessions: SessionRepository) {}

  async execute(input: {
    sessionId: SessionId
    now?: Date
  }): Promise<Result<AuthenticatedCaller, UnauthenticatedError>> {
    const now = input.now ?? new Date()
    const session = await this.sessions.findById(input.sessionId)
    if (session === null) return err(new UnauthenticatedError('no session'))
    if (session.isExpired(now)) return err(new UnauthenticatedError('session expired'))

    await this.slide(session, now)

    return ok({ userId: session.userId.value })
  }

  /**
   * `touch` says whether the window actually moved, so the common request pays
   * for a read and nothing more (AUTH-8, T017's one-write-per-hour rule).
   */
  private async slide(session: Session, now: Date): Promise<void> {
    if (!session.touch(now)) return

    await this.sessions.save(session)
  }
}
