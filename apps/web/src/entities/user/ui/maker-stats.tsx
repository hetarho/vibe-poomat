import type { auth } from '@repo/contracts'

type MakerStatsProps = {
  stats: auth.MakerStats
}

export const NO_HISTORY_YET = 'No history yet'

/** FDBK-6's fixed reasons, said the way a reader would say them. */
const REASON_LABELS = {
  task_not_done: 'Task not done',
  no_substance: 'No substance',
  spam_abuse: 'Spam or abuse',
} as const

function asPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/**
 * FDBK-8, v1's only check on maker power. A null rate reads as "no history yet"
 * rather than a spotless 0%, because a maker who has never decided anything has
 * not earned the clean record that 0% would imply.
 */
export function MakerStats({ stats }: MakerStatsProps) {
  return (
    <section aria-label="Rejection rate">
      <h2 className="font-medium text-sm">As a maker</h2>
      {stats.rejectionRate === null ? (
        <p className="mt-1 text-muted-foreground text-sm">{NO_HISTORY_YET}</p>
      ) : (
        <div className="mt-1">
          <p className="text-sm">
            <span className="font-semibold tabular-nums" data-testid="rejection-rate">
              {asPercent(stats.rejectionRate)}
            </span>{' '}
            rejected — {stats.rejectedCount} of {stats.settledCount} settled
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {Object.entries(REASON_LABELS).map(([reason, label]) => (
              <li key={reason}>
                {label}:{' '}
                <span className="tabular-nums">
                  {stats.reasons[reason as keyof typeof REASON_LABELS]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
