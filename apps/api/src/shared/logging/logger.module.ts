import { Module } from '@nestjs/common'
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import type { Options as PinoHttpOptions } from 'pino-http'
import { ConfigModule } from '../config/config.module'
import { ENV, type Env } from '../config/env.token'

/**
 * Exported so the tests drive the real options with a stubbed destination
 * instead of asserting against a hand-rolled copy of them.
 */
export function buildPinoHttpOptions(config: Env): PinoHttpOptions {
  return {
    level: config.LOG_LEVEL,
    // binds `reqId` onto the per-request child logger, so every line of a
    // request carries it without repeating the whole req object
    quietReqLogger: true,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'reqHeaders.authorization',
        'reqHeaders.cookie',
      ],
      censor: '[redacted]',
    },
  }
}

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (config: Env) => ({ pinoHttp: buildPinoHttpOptions(config) }),
    }),
  ],
})
export class LoggerModule {}
