import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { describe, expect, it, vi } from 'vitest'
import { configureApp, GLOBAL_PREFIX, PREFIX_EXCLUDED_ROUTES } from './bootstrap'
import { fakeEnv } from './test-support/fake-env'

describe('configureApp', () => {
  it('applies the versioned prefix, the config-driven CORS origin and the shutdown hooks', () => {
    const app = {
      setGlobalPrefix: vi.fn(),
      enableCors: vi.fn(),
      enableShutdownHooks: vi.fn(),
    }

    configureApp(app as unknown as NestFastifyApplication, fakeEnv({ WEB_URL: 'https://web.test' }))

    expect(app.setGlobalPrefix).toHaveBeenCalledWith(GLOBAL_PREFIX, {
      exclude: PREFIX_EXCLUDED_ROUTES,
    })
    expect(app.enableCors).toHaveBeenCalledWith({
      origin: 'https://web.test',
      credentials: true,
    })
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce()
  })
})
