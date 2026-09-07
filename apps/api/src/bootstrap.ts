import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import type { Env } from './shared/config/env.token'

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
