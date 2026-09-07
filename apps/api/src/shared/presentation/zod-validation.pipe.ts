import { HttpStatus } from '@nestjs/common'
import { createZodValidationPipe } from 'nestjs-zod'
import { z } from 'zod'
import { DomainHttpException } from './domain-http-exception'

export const VALIDATION_FAILED_CODE = 'VALIDATION_FAILED'
export const VALIDATION_FAILED_MESSAGE = 'request validation failed'

/**
 * Turns zod issues into T004's ValidationError wire shape instead of
 * nestjs-zod's own body, with `details` keyed by field name so the web form
 * layer can map messages onto inputs.
 */
export function validationExceptionFrom(error: unknown): Error {
  const details = error instanceof z.ZodError ? z.flattenError(error).fieldErrors : undefined

  return new DomainHttpException(
    VALIDATION_FAILED_CODE,
    HttpStatus.UNPROCESSABLE_ENTITY,
    VALIDATION_FAILED_MESSAGE,
    details,
  )
}

export const ZodValidationPipe = createZodValidationPipe({
  createValidationException: validationExceptionFrom,
})
