import type { feedback, projects } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { FeedbackSummary } from '../../../entities/feedback'
import { MissionPanel } from '../../../entities/mission'
import { useCurrentUser } from '../../../entities/session'
import { SignInDialog } from '../../../features/auth'
import { ClaimSlotBlock, StartControl } from '../../../features/claim-slot'
import { UpvoteButton, UpvoteControl } from '../../../features/upvote-project'
import { Button, Markdown, UserAvatar } from '../../../shared/ui'

/**
 * Only an owner ever renders this, so only an owner's browser fetches it — the
 * mission form, the close dialog and the credit read are all behind it.
 */
const OwnerMissionBlock = lazy(() => import('./owner-mission-block'))

export const NOT_FOUND_HEADING = 'No such project'
export const ARCHIVED_NOTICE =
  'You deleted this project. Nobody else can see it, and the feedback below stays yours to read.'
export const NO_FEEDBACK_YET = 'No feedback yet. An open mission is how it starts arriving.'

type ProjectDetailPageProps = {
  /** Null when there is no such project, or none this reader may see (PROJ-8). */
  project: projects.Project | null
  /** Every mission this project has run, newest first (PROJ-6). */
  missions: projects.Mission[]
  reports: feedback.Feedback[]
  hasMoreReports: boolean
  onLoadMoreReports: () => void
  loadingMoreReports: boolean
}

function on(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * PROJ-1 in full, and the live URL is the point of the page: PROJ-2 exists so
 * that a feedbacker can actually open the thing, so the link is the most
 * prominent control on it.
 */
export function ProjectDetailPage({
  project,
  missions,
  reports,
  hasMoreReports,
  onLoadMoreReports,
  loadingMoreReports,
}: ProjectDetailPageProps) {
  const viewer = useCurrentUser()

  if (project === null) {
    return (
      <section>
        <h1 className="font-semibold text-2xl tracking-tight">{NOT_FOUND_HEADING}</h1>
        <p className="mt-2 text-muted-foreground">
          This project is not here. A project its owner deleted stops being public (PROJ-8).
        </p>
        <Link to="/" className="mt-4 inline-block underline underline-offset-4">
          Back to the feed
        </Link>
      </section>
    )
  }

  const isOwn = viewer !== null && viewer.id === project.owner.id
  const latest = missions[0] ?? null
  const openMission = missions.find((mission) => mission.state === 'open') ?? null

  return (
    <div className="flex flex-col gap-10">
      {project.deletedAt === null ? null : (
        <p role="status" className="rounded-md border border-destructive/40 p-3 text-sm">
          {ARCHIVED_NOTICE}
        </p>
      )}

      <header className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          {isOwn ? null : viewer === null ? (
            <SignInDialog>
              <UpvoteControl count={project.upvoteCount} upvoted={false} />
            </SignInDialog>
          ) : (
            <UpvoteButton
              projectId={project.id}
              count={project.upvoteCount}
              upvoted={project.upvotedByViewer}
            />
          )}

          <div className="flex-1">
            <h1 className="font-semibold text-2xl tracking-tight">{project.title}</h1>
            <p className="mt-2 max-w-prose text-muted-foreground">{project.pitch}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {project.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-input px-2 py-0.5">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {isOwn ? (
            <Link
              to="/projects/$id/edit"
              params={{ id: project.id }}
              className="text-sm underline underline-offset-4"
            >
              Edit
            </Link>
          ) : null}
        </div>

        {project.coverUrl === null ? null : (
          <img src={project.coverUrl} alt="" className="max-h-72 w-full rounded-lg object-cover" />
        )}

        <div>
          <Button asChild size="lg">
            <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
              Open {new URL(project.liveUrl).hostname}
            </a>
          </Button>
          <p className="mt-2 text-muted-foreground text-xs">
            Opens in a new tab. Posted {on(project.createdAt)}.
          </p>
        </div>

        <Link
          to="/@{$handle}"
          params={{ handle: project.owner.handle }}
          className="flex items-center gap-2 text-sm hover:underline"
        >
          <UserAvatar user={project.owner} className="size-6" />
          {project.owner.displayName}
        </Link>
      </header>

      {project.description === null ? null : (
        <section aria-label="About this project">
          <h2 className="font-medium text-sm">About</h2>
          <Markdown className="mt-2 max-w-prose">{project.description}</Markdown>
        </section>
      )}

      <section aria-label="Mission" className="flex flex-col gap-4">
        <h2 className="font-medium text-sm">Mission</h2>
        <MissionPanel mission={latest} />
        {isOwn ? (
          <Suspense fallback={<p className="text-muted-foreground text-sm">Loading…</p>}>
            <OwnerMissionBlock projectId={project.id} openMission={openMission} />
          </Suspense>
        ) : openMission === null ? null : viewer === null ? (
          // FDBK-2 needs an account, so the press asks for one first
          <div className="flex flex-col gap-2">
            <SignInDialog>
              <StartControl />
            </SignInDialog>
            <p className="text-muted-foreground text-sm">
              A slot is yours for 24 hours once you are signed in.
            </p>
          </div>
        ) : (
          <ClaimSlotBlock mission={openMission} projectId={project.id} />
        )}
      </section>

      <section aria-label="Feedback">
        <h2 className="font-medium text-sm">Feedback</h2>
        {reports.length === 0 ? (
          <p className="mt-1 text-muted-foreground text-sm">{NO_FEEDBACK_YET}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id}>
                <FeedbackSummary report={report} />
              </li>
            ))}
          </ul>
        )}
        {hasMoreReports ? (
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={loadingMoreReports}
            onClick={onLoadMoreReports}
          >
            {loadingMoreReports ? 'Loading…' : 'More feedback'}
          </Button>
        ) : null}
      </section>
    </div>
  )
}
