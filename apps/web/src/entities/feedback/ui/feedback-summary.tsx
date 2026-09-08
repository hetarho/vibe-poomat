import type { feedback } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { UserAvatar } from '../../../shared/ui'

/** FDBK-6/FDBK-7 in a word, for a list that is not the report itself. */
const STATE_LABEL: Readonly<Record<feedback.FeedbackState, string>> = {
  pending: 'Waiting on the maker',
  accepted: 'Accepted',
  rejected: 'Rejected',
}

export const DELETED_AUTHOR = 'deleted user'

type FeedbackSummaryProps = {
  report: feedback.Feedback
}

function on(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * One line of a project's public feedback (FDBK-9). The report itself is a page
 * of its own (T038) — this is only enough to decide whether to open it. An
 * author of null is an account that has gone (AUTH-9), shown as a deleted user
 * rather than hidden, because the report stays public either way.
 */
export function FeedbackSummary({ report }: FeedbackSummaryProps) {
  const name = report.author?.displayName ?? DELETED_AUTHOR

  return (
    <article className="flex gap-3 rounded-md border border-border p-4">
      <UserAvatar user={{ displayName: name, avatarUrl: report.author?.avatarUrl ?? null }} />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link
            to="/feedbacks/$id"
            params={{ id: report.id }}
            className="font-medium underline underline-offset-4"
          >
            {name}
          </Link>
          <span className="text-muted-foreground"> · {on(report.submittedAt)}</span>
        </p>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{report.firstImpression}</p>
        <p className="mt-2 text-muted-foreground text-xs">
          {STATE_LABEL[report.state]}
          {report.state === 'rejected' && report.rejectionReason !== null
            ? ` — ${report.rejectionReason.replaceAll('_', ' ')}`
            : ''}
          {report.automatic ? ' (automatically)' : ''}
        </p>
      </div>
    </article>
  )
}
