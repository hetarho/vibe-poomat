import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { DomainHttpException, IS_PUBLIC, statusForDomainError } from '../../shared/presentation'
import type { RequestWithUser } from '../../shared/presentation/current-user.decorator'
import {
  AuthenticateSessionUseCase,
  UnauthenticatedError,
} from '../application/authenticate-session.use-case'
import { SessionId } from '../domain/session-id'
import { SESSION_COOKIE } from './auth-cookies'

/**
 * Every route is authenticated unless it says otherwise (`@Public()`). Registered
 * after the throttler in AppModule, so an anonymous flood is cut before any of
 * this reaches the database.
 *
 * Every account has the same rights (AUTH-7), so there is nothing here beyond
 * "is this a live session" — no roles, no scopes, nothing to get wrong.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authenticate: AuthenticateSessionUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ])
    const request = context.switchToHttp().getRequest<RequestWithUser>()
    const identified = await this.identify(request)

    // a public route still learns who is asking when a live session says so: an
    // owner reading their own hidden project (PROJ-8) needs exactly that, and a
    // route that refused to look would have to re-implement this guard itself
    if (isPublic === true) return true

    if (!identified) this.refuse('no live session')

    return true
  }

  /** Attaches the account behind the cookie, or reports that there is none. */
  private async identify(request: RequestWithUser): Promise<boolean> {
    const cookie = request.cookies?.[SESSION_COOKIE]
    if (cookie === undefined) return false

    // a malformed cookie is refused without a query: it cannot name a row we
    // issued, and answering it identically keeps the endpoint uninformative
    const sessionId = SessionId.parse(cookie)
    if (sessionId.isErr()) return false

    const caller = await this.authenticate.execute({ sessionId: sessionId.value })
    if (caller.isErr()) return false

    request.user = { id: caller.value.userId }

    return true
  }

  private refuse(reason: string): never {
    const error = new UnauthenticatedError(reason)

    throw new DomainHttpException(
      error.code,
      statusForDomainError(error),
      // the reason is for our logs; the caller learns only that it is not signed in
      'not signed in',
    )
  }
}
