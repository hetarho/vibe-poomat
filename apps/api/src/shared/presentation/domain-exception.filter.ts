import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { ErrorBody } from './domain-http-exception'
import { DomainHttpException } from './domain-http-exception'
import { codeForHttpStatus, INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE } from './http-status'

/**
 * Renders every error as `{ code, message, details? }` (ARCH-17). A framework
 * HttpException keeps its status so a routing 404 stays a 404; anything else is
 * a programmer error, logged in full and answered with an opaque 500.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>()
    const { status, body } = this.render(exception)

    reply.status(status).send(body)
  }

  private render(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof DomainHttpException) {
      return { status: exception.getStatus(), body: exception.getResponse() as ErrorBody }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus()

      return {
        status,
        body: { code: codeForHttpStatus(status), message: exception.message },
      }
    }

    this.logger.error(
      'unhandled exception',
      exception instanceof Error ? exception.stack : exception,
    )

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: INTERNAL_ERROR_CODE, message: INTERNAL_ERROR_MESSAGE },
    }
  }
}
