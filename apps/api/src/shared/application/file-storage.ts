export const FILE_STORAGE = Symbol('FILE_STORAGE')

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
