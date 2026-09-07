import { describe, expect, it, vi } from 'vitest'
import type { CreateUploadUrlInput, FileStorage, UploadTicket } from '../../shared/application'
import { CreateUploadUrlUseCase } from './create-upload-url.use-case'

/** A hand-written fake, which is what a framework-free use case allows. */
function fakeStorage() {
  const createUploadUrl = vi.fn(
    async (input: CreateUploadUrlInput): Promise<UploadTicket> => ({
      url: `https://storage.test/${input.key}?signed`,
      publicUrl: `https://cdn.test/${input.key}`,
      key: input.key,
      expiresInSeconds: 300,
    }),
  )
  const storage: FileStorage = {
    createUploadUrl,
    delete: vi.fn(async () => undefined),
    publicUrl: (key) => `https://cdn.test/${key}`,
  }

  return { storage, createUploadUrl }
}

describe('CreateUploadUrlUseCase', () => {
  it('hands back a ticket for an allowed upload', async () => {
    const { storage } = fakeStorage()

    const result = await new CreateUploadUrlUseCase(storage).execute({
      purpose: 'avatar',
      contentType: 'image/png',
      sizeBytes: 1024,
    })

    const ticket = result._unsafeUnwrap()
    expect(ticket.key.startsWith('avatar/')).toBe(true)
    expect(ticket.url).toContain('signed')
    expect(ticket.expiresInSeconds).toBe(300)
  })

  it('passes the server-derived key to storage, never a client one', async () => {
    const { storage, createUploadUrl } = fakeStorage()

    await new CreateUploadUrlUseCase(storage).execute({
      purpose: 'project-cover',
      contentType: 'image/webp',
      sizeBytes: 2048,
    })

    const input = createUploadUrl.mock.calls[0]?.[0]
    expect(input?.key).toMatch(/^project-cover\/[0-9a-f-]{36}\.webp$/)
    expect(input?.contentType).toBe('image/webp')
    expect(input?.maxBytes).toBe(2048)
  })

  it('never asks storage for anything when the policy refuses', async () => {
    const { storage, createUploadUrl } = fakeStorage()

    const result = await new CreateUploadUrlUseCase(storage).execute({
      purpose: 'avatar',
      contentType: 'image/gif',
      sizeBytes: 1024,
    })

    expect(result._unsafeUnwrapErr().code).toBe('UPLOAD_NOT_ALLOWED')
    expect(createUploadUrl).not.toHaveBeenCalled()
  })
})
