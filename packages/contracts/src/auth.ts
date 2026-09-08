import { z } from 'zod'
import { entityId, isoDate } from './common'

/** The two ways in (AUTH-1). */
export const authProviderSchema = z.enum(['github', 'google'])

export type AuthProvider = z.infer<typeof authProviderSchema>

/**
 * What anyone may see of an account (AUTH-3). The provider email is deliberately
 * absent: AUTH-4 keeps it for notifications, never for display.
 */
export const publicProfileSchema = z.object({
  id: entityId,
  handle: z.string().min(3).max(20),
  displayName: z.string().min(1),
  avatarUrl: z.url().nullable(),
  bio: z.string().max(160).nullable(),
  link: z.url().nullable(),
  createdAt: isoDate,
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
