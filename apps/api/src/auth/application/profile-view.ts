import type { FileStorage } from '../../shared/application'
import type { AuthProvider } from '../domain/auth-provider'
import type { User } from '../domain/user'

/**
 * CRED-7 puts these on the public profile. They are zero here and filled in by
 * the credit context (T021); shipping the shape now means the client that reads
 * it never has to change when they become real.
 */
export type CreditSummary = {
  balance: number
  received: number
  given: number
}

export const NO_CREDITS_YET: CreditSummary = { balance: 0, received: 0, given: 0 }

export type PublicProfileView = {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  link: string | null
  createdAt: Date
  credits: CreditSummary
}

export type MyProfileView = PublicProfileView & {
  email: string
  providers: AuthProvider[]
}

/**
 * One place turns a `User` into what an endpoint returns, so the public profile
 * and the owner's own view can never disagree about a field — and so the email
 * can only ever be added by the caller that is entitled to it (AUTH-4).
 *
 * The avatar is resolved here because only this layer holds the storage port:
 * an uploaded key becomes a public URL, a provider URL is already one.
 */
export function toPublicProfile(
  user: User,
  storage: FileStorage,
  credits: CreditSummary = NO_CREDITS_YET,
): PublicProfileView {
  const avatar = user.avatar

  return {
    id: user.id.value,
    handle: user.handle.value,
    displayName: user.displayName,
    avatarUrl:
      avatar === null ? null : avatar.isStorageKey ? storage.publicUrl(avatar.value) : avatar.value,
    bio: user.bio?.value ?? null,
    link: user.link?.value ?? null,
    createdAt: user.createdAt,
    credits,
  }
}
