import { v7 as uuidv7 } from 'uuid'
import { err, ok, type Result, ValidationError } from '../../shared/result'

/** What a caller may declare a file is for. The server derives the key from it. */
export const UPLOAD_PURPOSES = ['avatar', 'project-cover'] as const

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number]

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** Extension per allowed type, so the key never carries a client-supplied name. */
const EXTENSION_BY_CONTENT_TYPE: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export const ALLOWED_CONTENT_TYPES = Object.keys(EXTENSION_BY_CONTENT_TYPE)

export class UploadNotAllowedError extends ValidationError {
  override readonly code = 'UPLOAD_NOT_ALLOWED'
}

export type UploadPlan = {
  key: string
  contentType: string
  maxBytes: number
}

/**
 * The whole policy in one place: the type must be on the allowlist, the size
 * must fit the cap, and the key is minted here from a UUIDv7 — a client can
 * never propose a key and so can never overwrite someone else's object.
 */
export function planUpload(input: {
  purpose: string
  contentType: string
  declaredBytes: number
}): Result<UploadPlan, UploadNotAllowedError> {
  if (!UPLOAD_PURPOSES.includes(input.purpose as UploadPurpose)) {
    return err(new UploadNotAllowedError(`unknown upload purpose`, { purpose: input.purpose }))
  }

  const extension = EXTENSION_BY_CONTENT_TYPE[input.contentType]
  if (extension === undefined) {
    return err(
      new UploadNotAllowedError('content type is not an allowed image type', {
        contentType: input.contentType,
        allowed: ALLOWED_CONTENT_TYPES,
      }),
    )
  }

  if (!Number.isInteger(input.declaredBytes) || input.declaredBytes <= 0) {
    return err(new UploadNotAllowedError('size must be a positive number of bytes'))
  }

  if (input.declaredBytes > MAX_UPLOAD_BYTES) {
    return err(
      new UploadNotAllowedError('file is larger than the limit', {
        maxBytes: MAX_UPLOAD_BYTES,
        declaredBytes: input.declaredBytes,
      }),
    )
  }

  return ok({
    key: `${input.purpose}/${uuidv7()}.${extension}`,
    contentType: input.contentType,
    maxBytes: input.declaredBytes,
  })
}
