import { Controller, Get, HttpStatus, Res } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { Public } from '../presentation/public.decorator'
// a value import, not `import type`: NestJS reads the runtime class from the
// emitted decorator metadata to resolve this dependency
import { ReadinessRegistry } from './readiness-registry'

// an orchestrator holds no cookie, so the probes opt out of the session guard
@Public()
@Controller()
export class HealthController {
  constructor(private readonly readiness: ReadinessRegistry) {}

  /** Liveness: answers 200 as long as the process can serve a request. */
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' }
  }

  /**
   * Readiness. Uses `@Res({ passthrough: true })` rather than throwing, so the
   * probe never travels through the domain error mapper.
   */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: 'ready' | 'not-ready'; checks: Record<string, boolean> }> {
    const { ready, checks } = await this.readiness.report()
    reply.status(ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)

    return { status: ready ? 'ready' : 'not-ready', checks: { ...checks } }
  }
}
