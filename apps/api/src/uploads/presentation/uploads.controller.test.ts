import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FILE_STORAGE, type FileStorage } from '../../shared/application'
import { PresentationModule } from '../../shared/presentation/presentation.module'
import { CreateUploadUrlUseCase } from '../application/create-upload-url.use-case'
import { UploadsController } from './uploads.controller'

const storage: FileStorage = {
  createUploadUrl: vi.fn(async (input) => ({
    url: `https://storage.test/${input.key}?signed`,
    publicUrl: `https://cdn.test/${input.key}`,
    key: input.key,
    expiresInSeconds: 300,
  })),
  delete: vi.fn(async () => undefined),
  publicUrl: (key) => `https://cdn.test/${key}`,
}

describe('POST /uploads', () => {
  let app: NestFastifyApplication

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PresentationModule],
      controllers: [UploadsController],
      providers: [
        { provide: FILE_STORAGE, useValue: storage },
        {
          provide: CreateUploadUrlUseCase,
          inject: [FILE_STORAGE],
          useFactory: (fileStorage: FileStorage) => new CreateUploadUrlUseCase(fileStorage),
        },
      ],
    }).compile()

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  })

  afterEach(async () => {
    await app.close()
  })

  async function post(payload: unknown) {
    return app.inject({ method: 'POST', url: '/uploads', payload: payload as object })
  }

  it('answers 201 with a ticket the browser can use', async () => {
    const response = await post({ purpose: 'avatar', contentType: 'image/png', sizeBytes: 1024 })

    expect(response.statusCode).toBe(201)
    const body = response.json() as { url: string; key: string; expiresInSeconds: number }
    expect(body.key.startsWith('avatar/')).toBe(true)
    expect(body.url).toContain('signed')
    expect(body.expiresInSeconds).toBe(300)
  })

  it('refuses a content type outside the allowlist with 422 and a code', async () => {
    const response = await post({ purpose: 'avatar', contentType: 'image/gif', sizeBytes: 1024 })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a file over the cap with 422 and a code', async () => {
    const response = await post({
      purpose: 'avatar',
      contentType: 'image/png',
      sizeBytes: 3 * 1024 * 1024,
    })

    expect(response.statusCode).toBe(422)
    expect(response.json()).toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('refuses a purpose it does not know', async () => {
    const response = await post({
      purpose: 'whatever-i-like',
      contentType: 'image/png',
      sizeBytes: 1024,
    })

    expect(response.statusCode).toBe(422)
  })

  it('ignores a key a caller tries to propose', async () => {
    const response = await post({
      purpose: 'avatar',
      contentType: 'image/png',
      sizeBytes: 1024,
      key: '../../etc/passwd',
    })

    expect(response.statusCode).toBe(201)
    expect((response.json() as { key: string }).key).not.toContain('etc/passwd')
  })
})
