/**
 * FDBK-6's fixed list of reasons a maker may give. It lives in the kernel for
 * the same reason the event names do: FDBK-8 puts the distribution of these on a
 * profile, which the `auth` context renders, and neither context may import the
 * other's domain just to learn three strings (ARCH-10).
 */
export const REJECTION_REASONS = ['task_not_done', 'no_substance', 'spam_abuse'] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

export function isRejectionReason(value: unknown): value is RejectionReason {
  return REJECTION_REASONS.includes(value as RejectionReason)
}
