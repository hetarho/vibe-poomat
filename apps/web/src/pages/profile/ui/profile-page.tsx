import type { feedback, projects } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { useCurrentUser } from '../../../entities/session'
import { CreditCounters, MakerStats, type PublicProfile } from '../../../entities/user'
import { UserAvatar } from '../../../shared/ui'

export const UNKNOWN_HANDLE_HEADING = 'No such account'

type ProfilePageProps = {
  /** Null when nobody holds that handle (AUTH-6). */
  profile: PublicProfile | null
  handle: string
  projects: projects.FeedPage
  given: feedback.FeedbackPage
}

function joinedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'long' })
}

/**
 * AUTH-3's public profile. Everything on it is public by decision — the counters
 * (CRED-7), the rejection rate (FDBK-8), the projects and the feedback given —
 * and the provider email appears nowhere at all (AUTH-4).
 */
export function ProfilePage({ profile, handle, projects: owned, given }: ProfilePageProps) {
  const viewer = useCurrentUser()

  if (profile === null) {
    return (
      <section>
        <h1 className="font-semibold text-2xl tracking-tight">{UNKNOWN_HANDLE_HEADING}</h1>
        <p className="mt-2 text-muted-foreground">
          Nobody holds <span className="font-mono">@{handle}</span>. Handles are released the moment
          they are changed, so an old link can lead here.
        </p>
      </section>
    )
  }

  const isOwner = viewer !== null && viewer.id === profile.id

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-start gap-4">
        <UserAvatar user={profile} className="size-16" />
        <div className="flex-1">
          <h1 className="font-semibold text-2xl tracking-tight">{profile.displayName}</h1>
          <p className="text-muted-foreground text-sm">
            <span className="font-mono">@{profile.handle}</span> · joined{' '}
            {joinedOn(profile.createdAt)}
          </p>
          {profile.bio === null ? null : <p className="mt-3 max-w-prose text-sm">{profile.bio}</p>}
          {profile.link === null ? null : (
            <a
              href={profile.link}
              rel="noreferrer nofollow"
              target="_blank"
              className="mt-2 inline-block text-sm underline underline-offset-4"
            >
              {profile.link}
            </a>
          )}
        </div>
        {isOwner ? (
          <Link to="/settings" className="text-sm underline underline-offset-4">
            Edit profile
          </Link>
        ) : null}
      </header>

      <CreditCounters credits={profile.credits} />
      <MakerStats stats={profile.makerStats} />

      <section aria-label="Projects">
        <h2 className="font-medium text-sm">Projects</h2>
        {owned.items.length === 0 ? (
          <p className="mt-1 text-muted-foreground text-sm">Nothing posted yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {owned.items.map((project) => (
              <li key={project.id}>
                <Link
                  to="/projects/$id"
                  params={{ id: project.id }}
                  className="font-medium text-sm"
                >
                  {project.title}
                </Link>
                <p className="text-muted-foreground text-sm">{project.pitch}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Feedback given">
        <h2 className="font-medium text-sm">Feedback given</h2>
        {given.items.length === 0 ? (
          <p className="mt-1 text-muted-foreground text-sm">Nothing given yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {given.items.map((report) => (
              <li key={report.id}>
                <Link
                  to="/feedbacks/$id"
                  params={{ id: report.id }}
                  className="font-medium text-sm"
                >
                  {report.firstImpression.slice(0, 80)}
                </Link>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {report.state}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
