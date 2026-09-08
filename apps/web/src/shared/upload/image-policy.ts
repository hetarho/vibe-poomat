import { uploads } from '@repo/contracts'

/**
 * The presign policy of ARCH-37, said again on this side so somebody learns
 * before a 2MB upload rather than after it. The server is still what decides:
 * these mirror its rules, they do not replace them.
 */
export const ALLOWED_IMAGE_TYPES = uploads.allowedUploadContentTypes
export const MAX_IMAGE_BYTES = uploads.maxUploadBytes

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

/**
 * Answers with the content type narrowed on success, so the caller that has to
 * send it does not have to cast a `string` back into the allowlist it just
 * passed — the check and the narrowing are the same step.
 */
export type ImageCheck =
  | { allowed: true; contentType: AllowedImageType }
  | { allowed: false; problem: string }

export function checkImage(file: { type: string; size: number }): ImageCheck {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as AllowedImageType)) {
    return { allowed: false, problem: 'Pick a PNG, JPEG or WebP image.' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      allowed: false,
      problem: `That image is larger than ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
    }
  }

  return { allowed: true, contentType: file.type as AllowedImageType }
}

/** The same policy for a form that only wants the sentence. */
export function imageProblem(file: { type: string; size: number }): string | null {
  const checked = checkImage(file)

  return checked.allowed ? null : checked.problem
}
