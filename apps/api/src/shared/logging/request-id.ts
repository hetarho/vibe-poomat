import { v7 as uuidv7 } from 'uuid'

export const REQUEST_ID_HEADER = 'x-request-id'

/**
 * Fastify owns the request id: it adopts an inbound `x-request-id` so a trace
 * survives across services, and mints a time-ordered UUIDv7 when there is none.
 * pino then only reflects `req.id`, it never invents one.
 */
export const requestIdFastifyOptions = {
  requestIdHeader: REQUEST_ID_HEADER,
  genReqId: (): string => uuidv7(),
} as const
