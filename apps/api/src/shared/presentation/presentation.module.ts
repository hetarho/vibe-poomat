import { Module } from '@nestjs/common'
import { APP_FILTER, APP_PIPE } from '@nestjs/core'
import { DomainExceptionFilter } from './domain-exception.filter'
import { ZodValidationPipe } from './zod-validation.pipe'

@Module({
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
export class PresentationModule {}
