import { Controller, Get } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { Logger, LoggerModule as PinoLoggerModule } from 'nestjs-pino'
import { pinoHttp } from 'pino-http'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeEnv } from '../../test-support/fake-env'
import { buildPinoHttpOptions } from './logger.module'
import { REQUEST_ID_HEADER, requestIdFastifyOptions } from './request-id'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

@Controller()
class ProbeController {
  constructor(private readonly logger: Logger) {}

  @Get('probe')
  probe(): { ok: true } {
    this.logger.log('probe hit')

    return { ok: true }
  }
}

describe('request logging', () => {
  let app: NestFastifyApplication
  const records: Record<string, unknown>[] = []

  beforeEach(async () => {
    records.length = 0
    const destination = {
      write: (line: string) => {
        records.push(JSON.parse(line) as Record<string, unknown>)
      },
    }
    const moduleRef = await Test.createTestingModule({
      imports: [
        PinoLoggerModule.forRoot({
          pinoHttp: [buildPinoHttpOptions(fakeEnv({ LOG_LEVEL: 'info' })), destination],
        }),
      ],
      controllers: [ProbeController],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(requestIdFastifyOptions),
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('stamps every line of a request with the inbound x-request-id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { [REQUEST_ID_HEADER]: 'trace-from-caller' },
    })

    expect(response.statusCode).toBe(200)
    expect(records.length).toBeGreaterThan(0)
    expect(records.every((record) => record.reqId === 'trace-from-caller')).toBe(true)
    expect(records.some((record) => record.msg === 'probe hit')).toBe(true)
  })

  it('generates a UUIDv7 reqId when the header is absent', async () => {
    await app.inject({ method: 'GET', url: '/probe' })

    const ids = new Set(records.map((record) => record.reqId))
    expect(ids.size).toBe(1)
    expect(String([...ids][0])).toMatch(UUID_V7)
  })

  it('redacts the authorization and cookie headers', async () => {
    await app.inject({
      method: 'GET',
      url: '/probe',
      headers: { authorization: 'Bearer super-secret-token', cookie: 'sid=secret-session-id' },
    })

    const serialized = JSON.stringify(records)
    expect(serialized).toContain('[redacted]')
    expect(serialized).not.toContain('super-secret-token')
    expect(serialized).not.toContain('secret-session-id')
  })
})

describe('buildPinoHttpOptions', () => {
  it('takes its level from LOG_LEVEL', () => {
    expect(buildPinoHttpOptions(fakeEnv({ LOG_LEVEL: 'warn' })).level).toBe('warn')
    expect(buildPinoHttpOptions(fakeEnv({ LOG_LEVEL: 'debug' })).level).toBe('debug')
  })

  it('produces a logger that actually filters below that level', () => {
    const lines: Record<string, unknown>[] = []
    const middleware = pinoHttp(buildPinoHttpOptions(fakeEnv({ LOG_LEVEL: 'warn' })), {
      write: (line: string) => {
        lines.push(JSON.parse(line) as Record<string, unknown>)
      },
    })

    middleware.logger.info('below the level')
    middleware.logger.warn('at the level')

    expect(lines.map((line) => line.msg)).toEqual(['at the level'])
  })
})
