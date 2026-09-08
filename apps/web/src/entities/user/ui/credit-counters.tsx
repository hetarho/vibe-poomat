import type { auth } from '@repo/contracts'

type CreditCountersProps = {
  credits: auth.CreditSummary
}

const LABELS = [
  ['balance', 'Balance'],
  ['received', 'Received'],
  ['given', 'Given'],
] as const

/** CRED-7: these three are public, and the ledger behind them is not. */
export function CreditCounters({ credits }: CreditCountersProps) {
  return (
    <section aria-label="Credits">
      <dl className="flex gap-6">
        {LABELS.map(([key, label]) => (
          <div key={key}>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
            <dd className="font-semibold text-lg tabular-nums">{credits[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
