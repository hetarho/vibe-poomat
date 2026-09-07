import type { ThrottlerOptions } from '@nestjs/throttler'

/** A loose bucket for reads and a strict one for anything that changes state. */
export const READ_THROTTLER = 'read'
export const WRITE_THROTTLER = 'write'

export const throttlerPolicy: ThrottlerOptions[] = [
  { name: READ_THROTTLER, ttl: 60_000, limit: 300 },
  { name: WRITE_THROTTLER, ttl: 60_000, limit: 30, blockDuration: 60_000 },
]

/**
 * Keyed by the signed-in user when there is one, so one person on a shared IP
 * cannot spend everyone else's budget, and by the client IP otherwise.
 */
export function trackerFor(request: { user?: { id?: string }; ip?: string }): string {
  const userId = request.user?.id
  if (typeof userId === 'string' && userId.length > 0) return `user:${userId}`

  // Fastify's trustProxy hop count has already resolved this from
  // X-Forwarded-For, so there is exactly one place that decides who to believe
  return `ip:${request.ip ?? 'unknown'}`
}
