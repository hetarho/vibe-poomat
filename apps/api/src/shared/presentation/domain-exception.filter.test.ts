import { Controller, Get, Logger, NotFoundException } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { err, NotFoundError, ValidationError } from '../result'
import { PresentationModule } from './presentation.module'
import { unwrap } from './unwrap'

const LEAKED_DETAIL = 'connection string postgres://user:pw@db/secret'

@Controller('things')
class ThingsController {
  @Get('missing')
  missing(): unknown {
    return unwrap(err(new NotFoundError('thing not found')))
  }

  @Get('invalid')
  invalid(): unknown {
    return unwrap(err(new ValidationError('invalid thing', { fields: { name: 'required' } })))
  }

  @Get('framework-404')
  framework404(): unknown {
    throw new NotFoundException('nope')
  }

  @Get('boom')
  boom(): unknown {
    throw new Error(LEAKED_DETAIL)
  }
}

describe('DomainExceptionFilter', () => {
  let app: NestFastifyApplication
  let logged: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const moduleRef = await Test.createTestingModule({
      imports: [PresentationModule],
      controllers: [ThingsController],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    logged.mockRestore()
    await app.close()
  })

  it('renders a domain error as { code, message } with its mapped status', async () => {
    const response = await app.inject({ method: 'GET', url: '/things/missing' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'thing not found' })
  })

  it('includes details when the domain error carries them', async () => {
    const response = await app.inject({ method: 'GET', url: '/things/invalid' })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'invalid thing',
      details: { fields: { name: 'required' } },
    })
  })

  it('keeps a framework HttpException at its own status', async () => {
    const response = await app.inject({ method: 'GET', url: '/things/framework-404' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ code: 'NOT_FOUND', message: 'nope' })
  })

  it('leaves an unmatched route as a 404, not a 500', async () => {
    const response = await app.inject({ method: 'GET', url: '/no-such-route' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  it('answers an unexpected throwable with an opaque 500 and logs it in full', async () => {
    const response = await app.inject({ method: 'GET', url: '/things/boom' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ code: 'INTERNAL', message: 'internal server error' })
    expect(response.body).not.toContain(LEAKED_DETAIL)
    expect(logged).toHaveBeenCalledOnce()
    expect(JSON.stringify(logged.mock.calls)).toContain(LEAKED_DETAIL)
  })
})
