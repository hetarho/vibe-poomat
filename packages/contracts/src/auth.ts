import { z } from 'zod'
import { entityId, isoDate } from './common'

/** The two ways in (AUTH-1). */
export const authProviderSchema = z.enum(['github', 'google'])

export type AuthProvider = z.infer<typeof authProviderSchema>

export const HANDLE_MIN_LENGTH = 3
export const HANDLE_MAX_LENGTH = 20
export const BIO_MAX_LENGTH = 160

export const handleSchema = z
  .string()
  .min(HANDLE_MIN_LENGTH)
  .max(HANDLE_MAX_LENGTH)
  .regex(/^[a-z0-9_]+$/, 'may only contain a-z, 0-9 and underscore')

/**
 * What CRED-7 puts on a public profile. Present from the start and zero until
 * the credit context fills it in (T021), so the shape never changes under a
 * client that has already shipped.
 */
export const creditSummarySchema = z.object({
  balance: z.int().nonnegative(),
  received: z.int().nonnegative(),
  given: z.int().nonnegative(),
})

export type CreditSummary = z.infer<typeof creditSummarySchema>

/**
 * What anyone may see of an account (AUTH-3). The provider email is deliberately
 * absent: AUTH-4 keeps it for notifications, never for display.
 */
export const publicProfileSchema = z.object({
  id: entityId,
  handle: handleSchema,
  displayName: z.string().min(1),
  /** Already resolved to something a browser can load, key or provider URL alike. */
  avatarUrl: z.url().nullable(),
  bio: z.string().max(BIO_MAX_LENGTH).nullable(),
  link: z.url().nullable(),
  createdAt: isoDate,
  credits: creditSummarySchema,
})

export type PublicProfile = z.infer<typeof publicProfileSchema>

/**
 * The owner's own view of their account: everything public, plus the fields only
 * they may read. `email` is here and nowhere else (AUTH-4).
 */
export const meSchema = publicProfileSchema.extend({
  email: z.email(),
  /** Which providers reach this account (AUTH-5), oldest first. */
  providers: z.array(authProviderSchema),
})

export type Me = z.infer<typeof meSchema>

/**
 * A partial profile edit: an absent field is left alone, an explicit null clears
 * one. `avatarKey` is what T014's presign handed back, never a URL the caller
 * chose — the api resolves it on read.
 */
export const updateProfileRequestSchema = z
  .object({
    displayName: z.string().min(1).max(50),
    bio: z.string().max(BIO_MAX_LENGTH).nullable(),
    link: z.url().nullable(),
    avatarKey: z.string().min(1).nullable(),
  })
  .partial()

export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>

export const changeHandleRequestSchema = z.object({
  handle: handleSchema,
})

export type ChangeHandleRequest = z.infer<typeof changeHandleRequestSchema>

/** Codes `GET /auth/:provider/callback` can redirect to the sign-in page with. */
export const SIGN_IN_ERROR_CODES = [
  'AUTH_UNKNOWN_PROVIDER',
  'AUTH_PROVIDER_NOT_CONFIGURED',
  'AUTH_STATE_MISMATCH',
  'AUTH_PROVIDER_DENIED',
  'AUTH_PROVIDER_EXCHANGE_FAILED',
  'AUTH_PROVIDER_EMAIL_UNVERIFIED',
  'AUTH_HANDLE_TAKEN',
  'AUTH_IDENTITY_ALREADY_LINKED',
] as const

export type SignInErrorCode = (typeof SIGN_IN_ERROR_CODES)[number]
