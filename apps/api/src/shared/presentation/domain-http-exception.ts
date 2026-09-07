import { HttpException } from '@nestjs/common'

export type ErrorBody = {
  code: string
  message: string
  details?: unknown
}

/** Carries a DomainError across the presentation boundary with its code intact. */
export class DomainHttpException extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    message: string,
    readonly details?: unknown,
  ) {
    const body: ErrorBody = { code, message }
    if (details !== undefined) body.details = details
    super(body, status)
  }
}
