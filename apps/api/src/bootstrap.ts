import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Env } from './shared/config/env.token'
import { requestIdFastifyOptions } from './shared/logging/request-id'

/**
 * Everything the Fastify server itself needs. `trustProxy: 1` matches ARCH-30
 * exactly: one Caddy hop in front, so the client IP is the last entry a single
 * trusted proxy added and a spoofed X-Forwarded-For cannot reach past it.
 */
export const fastifyServerOptions = {
  ...requestIdFastifyOptions,
  trustProxy: 1,
} as const

export const GLOBAL_PREFIX = 'api/v1'

/** Probes answer at the root so an orchestrator never has to know the API version. */
export const PREFIX_EXCLUDED_ROUTES = ['health', 'ready']

/**
 * Everything `main.ts` does to a created app, in one place so the contract tests
 * exercise the same wiring the process runs.
 */
export function configureApp(app: NestFastifyApplication, config: Env): void {
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED_ROUTES })
  app.enableCors({ origin: config.WEB_URL, credentials: true })
  app.enableShutdownHooks()
}
