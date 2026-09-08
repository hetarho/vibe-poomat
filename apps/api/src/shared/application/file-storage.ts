export const FILE_STORAGE = Symbol('FILE_STORAGE')

/**
 * The job that removes an object nothing points at any more. The name lives
 * beside the port rather than with its handler, so a use case can enqueue it
 * without importing infrastructure (ARCH-11).
 */
export const DELETE_OBJECT_JOB = 'storage.delete-object'

export type DeleteObjectPayload = { key: string }

export type UploadTicket = {
  /** Where the browser PUTs the bytes; the api never sees them (ARCH-37). */
  url: string
  /** Present only for policy-form uploads; a presigned PUT needs none. */
  fields?: Readonly<Record<string, string>>
  publicUrl: string
  key: string
  expiresInSeconds: number
}

export type CreateUploadUrlInput = {
  key: string
  contentType: string
  maxBytes: number
}

export type FileStorage = {
  createUploadUrl(input: CreateUploadUrlInput): Promise<UploadTicket>
  delete(key: string): Promise<void>
  publicUrl(key: string): string
}
