import type { feedback } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import {
  autoAcceptAt,
  hoursUntilAutoAccept,
  settleStage,
  stateLabel,
} from '../../../entities/feedback'
import { Button, UserAvatar } from '../../../shared/ui'

export const INBOX_HEADING = 'Feedback on your projects'
export const INBOX_EMPTY =
  'Nothing yet. Open a mission on one of your projects and the reports arrive here.'
export const WAITING_HEADING = 'Waiting on you'
export const DECIDED_HEADING = 'Decided'

type MakerInboxPageProps = {
  reports: feedback.Feedback[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

function on(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Row({ report }: { report: feedback.Feedback }) {
  const pending = report.state === 'pending'
  const stage = pending ? settleStage(report.submittedAt, Date.now()) : null
  const left = hoursUntilAutoAccept(report.submittedAt, Date.now())

  return (
    <article className="flex gap-3 rounded-md border border-border p-4">
      <UserAvatar
        user={{
          displayName: report.author?.displayName ?? 'deleted user',
          avatarUrl: report.author?.avatarUrl ?? null,
        }}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <Link
            to="/feedbacks/$id"
            params={{ id: report.id }}
            className="font-medium underline underline-offset-4"
          >
            {report.author?.displayName ?? 'deleted user'}
          </Link>
          <span className="text-muted-foreground"> · {on(report.submittedAt)}</span>
        </p>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{report.firstImpression}</p>
        <p
          className={
            stage === 'plenty' || stage === null
              ? 'mt-2 text-muted-foreground text-xs'
              : 'mt-2 font-medium text-xs'
          }
          data-testid={pending ? `deadline-${report.id}` : `state-${report.id}`}
        >
          {pending
            ? `${left === 0 ? 'Accepting itself any moment' : `${left}h left`} — decides itself ${on(
                autoAcceptAt(report.submittedAt).toISOString(),
              )}`
            : stateLabel(report)}
        </p>
      </div>
    </article>
  )
}

/**
 * FDBK-7 puts a clock on an undecided report, so those come first and each one
 * says how long is left. Everything below them has already been settled — by
 * the maker or by that same clock.
 */
export function MakerInboxPage({ reports, hasMore, loadingMore, onLoadMore }: MakerInboxPageProps) {
  const waiting = reports.filter((report) => report.state === 'pending')
  const decided = reports.filter((report) => report.state !== 'pending')

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{INBOX_HEADING}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          A report accepts itself 72 hours after it arrives, and the credit goes to whoever wrote
          it.
        </p>
      </header>

      {reports.length === 0 ? <p className="text-muted-foreground text-sm">{INBOX_EMPTY}</p> : null}

      {waiting.length === 0 ? null : (
        <section aria-labelledby="waiting-heading" className="flex flex-col gap-3">
          <h2 id="waiting-heading" className="font-medium text-sm">
            {WAITING_HEADING}
          </h2>
          {waiting.map((report) => (
            <Row key={report.id} report={report} />
          ))}
        </section>
      )}

      {decided.length === 0 ? null : (
        <section aria-labelledby="decided-heading" className="flex flex-col gap-3">
          <h2 id="decided-heading" className="font-medium text-sm">
            {DECIDED_HEADING}
          </h2>
          {decided.map((report) => (
            <Row key={report.id} report={report} />
          ))}
        </section>
      )}

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      ) : null}
    </div>
  )
}
