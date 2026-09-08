import type { feedback } from '@repo/contracts'
import { UserAvatar } from '../../../shared/ui'
import { REPORT_LABELS } from '../lib/report-rules'
import { autoAcceptAt, settleStage, WARN_AFTER_HOURS } from '../lib/settle-clock'
import { DELETED_AUTHOR } from './feedback-summary'

/** FDBK-6's fixed reasons, in words a feedbacker can read. */
export const REASON_LABEL: Readonly<Record<feedback.RejectionReason, string>> = {
  task_not_done: 'The task was not done',
  no_substance: 'Nothing substantial in it',
  spam_abuse: 'Spam or abuse',
}

export const AUTO_ACCEPTED_LABEL = 'Accepted automatically'
export const ACCEPTED_LABEL = 'Accepted by the maker'
export const REJECTED_LABEL = 'Rejected by the maker'
export const PENDING_LABEL = 'Waiting on the maker'

/** FDBK-7: distinct from a manual accept, because it says something different. */
export function stateLabel(report: feedback.Feedback): string {
  if (report.state === 'pending') return PENDING_LABEL
  if (report.state === 'rejected') return REJECTED_LABEL

  return report.automatic ? AUTO_ACCEPTED_LABEL : ACCEPTED_LABEL
}

function at(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type ReportViewProps = {
  report: feedback.Feedback
  /** The mission's questions, so a positional answer can be labelled. */
  questions: readonly string[]
  /** Only the maker is told about the 48h warning (FDBK-7). */
  isMaker: boolean
}

type SectionProps = { label: string; children: string }

function Section({ label, children }: SectionProps) {
  return (
    <div>
      <h3 className="font-medium text-sm">{label}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm">{children}</p>
    </div>
  )
}

/**
 * FDBK-3's report as written, public because FDBK-9 says so — including a
 * rejection and its reason, which is exactly what makes a rejection something
 * the feedbacker can answer and FDBK-8 something a maker is accountable for.
 */
export function ReportView({ report, questions, isMaker }: ReportViewProps) {
  const stage = report.state === 'pending' ? settleStage(report.submittedAt, Date.now()) : null

  return (
    <article className="flex flex-col gap-6">
      <header className="flex items-start gap-3">
        <UserAvatar
          user={{
            displayName: report.author?.displayName ?? DELETED_AUTHOR,
            avatarUrl: report.author?.avatarUrl ?? null,
          }}
          className="size-10"
        />
        <div className="flex-1">
          <p className="font-medium text-sm">
            {report.author === null ? DELETED_AUTHOR : report.author.displayName}
            {report.author === null ? null : (
              <span className="font-mono font-normal text-muted-foreground">
                {' '}
                @{report.author.handle}
              </span>
            )}
          </p>
          <p className="text-muted-foreground text-sm">Submitted {at(report.submittedAt)}</p>
        </div>
        <span
          className="rounded-full border border-input px-3 py-1 text-xs"
          data-testid="report-state"
        >
          {stateLabel(report)}
        </span>
      </header>

      {report.state === 'pending' ? (
        <p className="rounded-md border border-border p-3 text-sm" data-testid="settle-deadline">
          {isMaker ? 'You have' : 'The maker has'} until{' '}
          <span className="font-medium">{at(autoAcceptAt(report.submittedAt).toISOString())}</span>{' '}
          to decide. After that it is accepted automatically and the credit goes to the feedbacker.
          {isMaker && stage !== 'plenty' ? (
            <span className="block pt-1 font-medium" data-testid="settle-warning">
              {stage === 'overdue'
                ? 'That moment has passed — it will accept itself any moment now.'
                : `Past the ${WARN_AFTER_HOURS}-hour mark — under a day left before it accepts itself.`}
            </span>
          ) : null}
        </p>
      ) : null}

      {report.state === 'rejected' ? (
        <div className="rounded-md border border-destructive/40 p-3" data-testid="rejection">
          <p className="font-medium text-sm">
            {REASON_LABEL[report.rejectionReason ?? 'no_substance']}
          </p>
          {report.rejectionNote === null ? null : (
            <p className="mt-1 whitespace-pre-wrap text-sm">{report.rejectionNote}</p>
          )}
          <p className="mt-2 text-muted-foreground text-xs">
            A rejected report stays public with its reason (FDBK-9), and counts towards the maker's
            rejection rate.
          </p>
        </div>
      ) : null}

      <Section label={REPORT_LABELS.firstImpression}>{report.firstImpression}</Section>
      <Section label={REPORT_LABELS.stuckAt}>{report.stuckAt}</Section>

      <div>
        <h3 className="font-medium text-sm">Would you pay for this?</h3>
        <p className="mt-1 text-sm" data-testid="would-pay">
          <span className="font-medium">{report.wouldPay ? 'Yes' : 'No'}</span> —{' '}
          {report.wouldPayReason}
        </p>
      </div>

      <Section label={REPORT_LABELS.suggestion}>{report.suggestion}</Section>

      {report.answers.length === 0 ? null : (
        <div className="flex flex-col gap-4">
          <h3 className="font-medium text-sm">What the maker asked</h3>
          {report.answers.map((answer, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: an answer is positional against the mission's frozen questions (PROJ-7), so its index is its identity
            <div key={index}>
              <p className="font-medium text-sm">{questions[index] ?? `Question ${index + 1}`}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{answer}</p>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
