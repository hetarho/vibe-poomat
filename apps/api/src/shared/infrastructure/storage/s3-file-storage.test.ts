import { describe, expect, it } from 'vitest'
import { PRESIGN_EXPIRY_SECONDS, S3FileStorage } from './s3-file-storage'

const config = {
  endpoint: 'http://localhost:9000',
  bucket: 'vibe-poomat',
  accessKeyId: 'minioadmin',
  secretAccessKey: 'minioadmin',
  publicBaseUrl: 'https://cdn.example/vibe-poomat',
}

describe('S3FileStorage', () => {
  it('composes the public URL from the base and the key', () => {
    const storage = new S3FileStorage(config)

    expect(storage.publicUrl('avatar/abc.png')).toBe(
      'https://cdn.example/vibe-poomat/avatar/abc.png',
    )
  })

  it('does not double the slash when the base carries one', () => {
    const storage = new S3FileStorage({ ...config, publicBaseUrl: 'https://cdn.example/bucket/' })

    expect(storage.publicUrl('avatar/abc.png')).toBe('https://cdn.example/bucket/avatar/abc.png')
  })

  it('signs a PUT that expires in five minutes', async () => {
    const ticket = await new S3FileStorage(config).createUploadUrl({
      key: 'avatar/abc.png',
      contentType: 'image/png',
      maxBytes: 1024,
    })

    expect(ticket.expiresInSeconds).toBe(PRESIGN_EXPIRY_SECONDS)
    expect(PRESIGN_EXPIRY_SECONDS).toBe(300)
    expect(ticket.url).toContain('X-Amz-Expires=300')
    expect(ticket.url).toContain('/vibe-poomat/avatar/abc.png')
    expect(ticket.publicUrl).toBe('https://cdn.example/vibe-poomat/avatar/abc.png')
  })

  it('signs the content type and the length, so neither can be changed', async () => {
    const ticket = await new S3FileStorage(config).createUploadUrl({
      key: 'avatar/abc.png',
      contentType: 'image/png',
      maxBytes: 1024,
    })

    const signed = new URL(ticket.url).searchParams.get('X-Amz-SignedHeaders') ?? ''
    expect(signed.split(';').sort()).toEqual(['content-length', 'content-type', 'host'])
  })

  it('signs no body checksum, which a real upload could never match', async () => {
    const ticket = await new S3FileStorage(config).createUploadUrl({
      key: 'avatar/abc.png',
      contentType: 'image/png',
      maxBytes: 1024,
    })

    expect(ticket.url).not.toContain('x-amz-checksum')
  })
})
