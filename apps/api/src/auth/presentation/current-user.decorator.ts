import { createParamDecorator, type ExecutionContext } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

/**
 * What the guard leaves on the request. The shape is `{ id }` because that is
 * what the throttler already reads to key a bucket by account rather than by IP
 * (ARCH-41, T015).
 */
export type RequestUser = { id: string }

export type RequestWithUser = FastifyRequest & { user?: RequestUser }

/**
 * The account id of whoever is signed in. Only reachable on a guarded route, so
 * it is a plain string rather than a possibly-absent one: an anonymous request
 * never gets as far as the handler.
 */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>()
  const userId = request.user?.id
  if (userId === undefined) {
    throw new Error('@CurrentUser() on a route the session guard does not protect')
  }

  return userId
})
