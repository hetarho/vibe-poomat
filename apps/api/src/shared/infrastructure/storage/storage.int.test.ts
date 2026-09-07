import { CreateBucketCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { planUpload } from '../../../uploads/application/upload-policy'
import { S3FileStorage } from './s3-file-storage'

const BUCKET = 'vibe-poomat-test'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02, 0x03])

let container: StartedMinioContainer
let storage: S3FileStorage
let client: S3Client

/** Uploads through the presigned URL exactly as a browser would. */
async function put(url: string, body: Buffer, contentType: string): Promise<{ status: number }> {
  const response = await fetch(url, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'content-type': contentType, 'content-length': String(body.length) },
  })

  return { status: response.status }
}

describe('presigned uploads against a real MinIO', () => {
  beforeAll(async () => {
    container = await new MinioContainer('minio/minio:RELEASE.2025-04-22T22-12-26Z').start()
    const endpoint = container.getConnectionUrl()
    const credentials = {
      accessKeyId: container.getUsername(),
      secretAccessKey: container.getPassword(),
    }

    client = new S3Client({
      region: 'auto',
      endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      credentials,
    })
    await client.send(new CreateBucketCommand({ Bucket: BUCKET }))

    storage = new S3FileStorage({
      endpoint,
      bucket: BUCKET,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      publicBaseUrl: `${endpoint}/${BUCKET}`,
    })
  }, 240_000)

  afterAll(async () => {
    client.destroy()
    await container.stop()
  })

  it('uploads through the URL it issued and reads the object back', async () => {
    const plan = planUpload({
      purpose: 'avatar',
      contentType: 'image/png',
      declaredBytes: PNG.length,
    })._unsafeUnwrap()
    const ticket = await storage.createUploadUrl(plan)

    expect((await put(ticket.url, PNG, 'image/png')).status).toBe(200)

    const stored = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: plan.key }))
    expect(Buffer.from(await stored.Body!.transformToByteArray())).toEqual(PNG)
    expect(stored.ContentType).toBe('image/png')
  })

  it('refuses an upload that claims a different content type', async () => {
    const plan = planUpload({
      purpose: 'avatar',
      contentType: 'image/png',
      declaredBytes: PNG.length,
    })._unsafeUnwrap()
    const ticket = await storage.createUploadUrl(plan)

    // the server signed image/png; sending anything else breaks the signature
    expect((await put(ticket.url, PNG, 'text/html')).status).toBe(403)
  })

  it('refuses an upload larger than the size that was signed', async () => {
    const plan = planUpload({
      purpose: 'avatar',
      contentType: 'image/png',
      declaredBytes: PNG.length,
    })._unsafeUnwrap()
    const ticket = await storage.createUploadUrl(plan)

    const bigger = Buffer.concat([PNG, Buffer.alloc(64, 0x61)])
    expect((await put(ticket.url, bigger, 'image/png')).status).toBe(403)
  })

  it('deletes an object it stored', async () => {
    const plan = planUpload({
      purpose: 'project-cover',
      contentType: 'image/webp',
      declaredBytes: PNG.length,
    })._unsafeUnwrap()
    const ticket = await storage.createUploadUrl(plan)
    await put(ticket.url, PNG, 'image/webp')

    await storage.delete(plan.key)

    await expect(
      client.send(new GetObjectCommand({ Bucket: BUCKET, Key: plan.key })),
    ).rejects.toThrow()
  })

  it('deleting something that is not there is not an error', async () => {
    await expect(storage.delete('avatar/never-existed.png')).resolves.toBeUndefined()
  })

  it('composes a public URL that actually serves the object', async () => {
    const plan = planUpload({
      purpose: 'avatar',
      contentType: 'image/png',
      declaredBytes: PNG.length,
    })._unsafeUnwrap()
    const ticket = await storage.createUploadUrl(plan)

    expect(ticket.publicUrl).toBe(`${container.getConnectionUrl()}/${BUCKET}/${plan.key}`)
    expect(storage.publicUrl(plan.key)).toBe(ticket.publicUrl)
  })
})
