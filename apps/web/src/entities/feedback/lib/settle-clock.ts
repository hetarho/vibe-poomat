import { feedback } from '@repo/contracts'

/** FDBK-7's two markers, both measured from when the report came in. */
export const WARN_AFTER_HOURS = feedback.WARN_AFTER_HOURS
export const AUTO_ACCEPT_AFTER_HOURS = feedback.AUTO_ACCEPT_AFTER_HOURS

const HOUR_MS = 3_600_000

export function warnAt(submittedAt: string): Date {
  return new Date(new Date(submittedAt).getTime() + WARN_AFTER_HOURS * HOUR_MS)
}

/** When the report accepts itself and the credit moves anyway (FDBK-7, CRED-4). */
export function autoAcceptAt(submittedAt: string): Date {
  return new Date(new Date(submittedAt).getTime() + AUTO_ACCEPT_AFTER_HOURS * HOUR_MS)
}

export type SettleStage = 'plenty' | 'warning' | 'overdue'

/**
 * Which side of FDBK-7's markers a pending report is on. The server's jobs are
 * what actually settle it, so this only decides what a page says: an `overdue`
 * report is one whose auto-accept has been scheduled and not yet run.
 */
export function settleStage(submittedAt: string, now: number): SettleStage {
  if (now >= autoAcceptAt(submittedAt).getTime()) return 'overdue'
  if (now >= warnAt(submittedAt).getTime()) return 'warning'

  return 'plenty'
}

/** Whole hours left before it accepts itself; zero once that moment has passed. */
export function hoursUntilAutoAccept(submittedAt: string, now: number): number {
  const left = autoAcceptAt(submittedAt).getTime() - now

  return left <= 0 ? 0 : Math.ceil(left / HOUR_MS)
}
