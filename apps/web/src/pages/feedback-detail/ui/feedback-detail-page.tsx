import type { feedback, projects } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { ReportView } from '../../../entities/feedback'
import { useCurrentUser } from '../../../entities/session'
import { Thread } from '../../../features/reply-thread'
import { SettleControls } from '../../../features/settle-feedback'

export const NOT_FOUND_HEADING = 'No such report'

type FeedbackDetailPageProps = {
  report: feedback.Feedback | null
  /** For the questions the answers line up against (PROJ-7). */
  mission: projects.Mission | null
  project: projects.Project | null
  replies: feedback.FeedbackReply[]
  hasMoreReplies: boolean
  loadingMoreReplies: boolean
  onLoadMoreReplies: () => void
}

/**
 * FDBK-9's public report. Who is reading decides two things and nothing else:
 * whether the settle controls are offered (the maker, on a pending report) and
 * whether the reply box is (either participant, FDBK-5).
 */
export function FeedbackDetailPage({
  report,
  mission,
  project,
  replies,
  hasMoreReplies,
  loadingMoreReplies,
  onLoadMoreReplies,
}: FeedbackDetailPageProps) {
  const viewer = useCurrentUser()

  if (report === null) {
    return (
      <section>
        <h1 className="font-semibold text-2xl tracking-tight">{NOT_FOUND_HEADING}</h1>
        <p className="mt-2 text-muted-foreground">There is no report at this address.</p>
        <Link to="/" className="mt-4 inline-block underline underline-offset-4">
          Back to the feed
        </Link>
      </section>
    )
  }

  const isMaker = viewer !== null && viewer.id === report.makerId
  const isAuthor = viewer !== null && report.author !== null && viewer.id === report.author.id
  // FDBK-5's two, resolved from the report itself rather than from the project,
  // which PROJ-8 can refuse while FDBK-9 keeps this page public
  const participant =
    isMaker || isAuthor
      ? {
          id: viewer.id,
          handle: viewer.handle,
          displayName: viewer.displayName,
          avatarUrl: viewer.avatarUrl,
        }
      : null

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Feedback</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          on{' '}
          <Link
            to="/projects/$id"
            params={{ id: report.projectId }}
            className="underline underline-offset-4"
          >
            {project === null ? 'a project' : project.title}
          </Link>
        </p>
      </header>

      <ReportView report={report} questions={mission?.questions ?? []} isMaker={isMaker} />

      {isMaker && report.state === 'pending' ? <SettleControls report={report} /> : null}

      <Thread
        feedbackId={report.id}
        replies={replies}
        participant={participant}
        hasMore={hasMoreReplies}
        loadingMore={loadingMoreReplies}
        onLoadMore={onLoadMoreReplies}
      />
    </div>
  )
}
