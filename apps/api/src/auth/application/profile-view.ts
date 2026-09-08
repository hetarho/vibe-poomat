import type { CreditSummary, FileStorage, MakerStats } from '../../shared/application'
import { EMPTY_CREDIT_SUMMARY, EMPTY_MAKER_STATS } from '../../shared/application'
import type { AuthProvider } from '../domain/auth-provider'
import type { User } from '../domain/user'

export type PublicProfileView = {
  id: string
  handle: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  link: string | null
  createdAt: Date
  credits: CreditSummary
  /** FDBK-8, public and ungated (AUTH-7): how this account judges the work it asks for. */
  makerStats: MakerStats
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
  credits: CreditSummary = EMPTY_CREDIT_SUMMARY,
  makerStats: MakerStats = EMPTY_MAKER_STATS,
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
    makerStats,
  }
}
