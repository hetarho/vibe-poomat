import { Body, Controller, Post } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { entityId } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { DomainHttpException } from './domain-http-exception'
import { PresentationModule } from './presentation.module'
import {
  VALIDATION_FAILED_CODE,
  VALIDATION_FAILED_MESSAGE,
  validationExceptionFrom,
} from './zod-validation.pipe'

const OWNER_ID = '01a07a84-ba0a-765f-99ba-d136a7396b3c'

/** Built from a @repo/contracts primitive, so web and api agree on the id shape. */
const createThingSchema = z.object({
  ownerId: entityId,
  title: z.string().min(3),
  tags: z.array(z.string()).max(2),
})

class CreateThingDto extends createZodDto(createThingSchema) {}

@Controller('things')
class ThingsController {
  @Post()
  create(@Body() body: CreateThingDto): { title: string; keys: string[] } {
    return { title: body.title, keys: Object.keys(body).sort() }
  }
}

describe('validationExceptionFrom', () => {
  it('reports zod issues as a DomainHttpException keyed by field', () => {
    const parsed = createThingSchema.safeParse({ ownerId: 'nope', title: 'a', tags: [] })
    const exception = validationExceptionFrom(parsed.error)

    expect(exception).toBeInstanceOf(DomainHttpException)
    expect((exception as DomainHttpException).getStatus()).toBe(422)
    expect((exception as DomainHttpException).getResponse()).toMatchObject({
      code: VALIDATION_FAILED_CODE,
      message: VALIDATION_FAILED_MESSAGE,
      details: { ownerId: expect.any(Array), title: expect.any(Array) },
    })
  })

  it('still produces the code when handed something that is not a ZodError', () => {
    const exception = validationExceptionFrom(new Error('surprise')) as DomainHttpException

    expect(exception.code).toBe(VALIDATION_FAILED_CODE)
    expect(exception.details).toBeUndefined()
  })
})

describe('a DTO built from a contracts schema', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PresentationModule],
      controllers: [ThingsController],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
  })

  it('accepts a valid payload and strips unknown keys', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/things',
      payload: { ownerId: OWNER_ID, title: 'a real title', tags: ['x'], sneaky: 'dropped' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      title: 'a real title',
      keys: ['ownerId', 'tags', 'title'],
    })
  })

  it('rejects a bad payload with 422 and per-field details', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/things',
      payload: { ownerId: 'not-a-uuid', title: 'a', tags: ['a', 'b', 'c'] },
    })

    expect(response.statusCode).toBe(422)
    const body = response.json() as {
      code: string
      message: string
      details: Record<string, string[]>
    }
    expect(body.code).toBe(VALIDATION_FAILED_CODE)
    expect(body.message).toBe(VALIDATION_FAILED_MESSAGE)
    expect(Object.keys(body.details).sort()).toEqual(['ownerId', 'tags', 'title'])
    expect(body.details.title?.[0]).toContain('3')
  })

  it('rejects a UUIDv4 owner id, because contracts demands v7', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/things',
      payload: { ownerId: '9f8d1f4e-2b4a-4c1e-8b3f-2c9a1e7d4b55', title: 'a real title', tags: [] },
    })

    expect(response.statusCode).toBe(422)
    expect((response.json() as { details: Record<string, string[]> }).details.ownerId).toBeDefined()
  })
})
