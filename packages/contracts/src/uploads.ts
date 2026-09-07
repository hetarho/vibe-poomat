import { z } from 'zod'

/** What a caller may declare a file is for; the server derives the key from it. */
export const uploadPurposeSchema = z.enum(['avatar', 'project-cover'])

export const allowedUploadContentTypes = ['image/png', 'image/jpeg', 'image/webp'] as const

export const maxUploadBytes = 2 * 1024 * 1024

export const createUploadUrlRequestSchema = z.object({
  purpose: uploadPurposeSchema,
  contentType: z.enum(allowedUploadContentTypes),
  sizeBytes: z.int().positive().max(maxUploadBytes),
})

export const uploadTicketSchema = z.object({
  /** Where the browser PUTs the bytes; they never pass through the api. */
  url: z.string().min(1),
  publicUrl: z.string().min(1),
  key: z.string().min(1),
  expiresInSeconds: z.int().positive(),
})

export type UploadPurpose = z.infer<typeof uploadPurposeSchema>
export type CreateUploadUrlRequest = z.infer<typeof createUploadUrlRequestSchema>
export type UploadTicket = z.infer<typeof uploadTicketSchema>
