import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { CreateUploadUrlInput, FileStorage, UploadTicket } from '../../application'

export const PRESIGN_EXPIRY_SECONDS = 5 * 60

export type S3StorageConfig = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl: string
  region?: string
}

/**
 * One adapter for both MinIO locally and Cloudflare R2 in production, which is
 * why local development uses MinIO rather than a filesystem stand-in: an
 * S3-only bug would otherwise only appear in production (ARCH-37).
 */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client

  constructor(private readonly config: S3StorageConfig) {
    this.client = new S3Client({
      region: config.region ?? 'auto',
      endpoint: config.endpoint,
      // MinIO serves buckets as a path, not a subdomain
      forcePathStyle: true,
      // the SDK otherwise signs a checksum of the (empty) body at signing time,
      // which every real upload through the URL would then fail to match
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    })
  }

  async createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTicket> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.maxBytes,
      }),
      {
        expiresIn: PRESIGN_EXPIRY_SECONDS,
        // both have to be signed or the policy is only advice: without them a
        // client could PUT any type, at any size, to a URL we issued
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    )

    return {
      url,
      publicUrl: this.publicUrl(input.key),
      key: input.key,
      expiresInSeconds: PRESIGN_EXPIRY_SECONDS,
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }))
  }

  /** The api stores keys, never URLs, and composes them on the way out. */
  publicUrl(key: string): string {
    return `${this.config.publicBaseUrl.replace(/\/+$/, '')}/${key}`
  }
}
