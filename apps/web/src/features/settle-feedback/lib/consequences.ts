import { REJECTION_REASONS, type RejectionReason } from '@repo/contracts'

/**
 * CRED-4, said before the button rather than after it. One credit is already in
 * escrow; accepting moves it to the feedbacker and rejecting moves it back — so
 * both are the same movement described from opposite ends, and neither is free.
 */
export const ACCEPT_CONSEQUENCE =
  'One credit leaves escrow and goes to the feedbacker. The report stays public either way.'

export const REJECT_CONSEQUENCE =
  'One credit comes back to your balance from escrow. The report stays public with the reason you pick, and counts towards your rejection rate.'

/** FDBK-6's three, in the order the form offers them. */
export const REJECTION_REASON_OPTIONS: ReadonlyArray<{
  value: RejectionReason
  label: string
  hint: string
}> = [
  {
    value: 'task_not_done',
    label: 'The task was not done',
    hint: 'They did not do what the mission asked.',
  },
  {
    value: 'no_substance',
    label: 'Nothing substantial in it',
    hint: 'It meets the length rule but says nothing usable.',
  },
  {
    value: 'spam_abuse',
    label: 'Spam or abuse',
    hint: 'Not feedback at all.',
  },
]

/** A guard against the option list drifting from the contract it mirrors. */
export const ALL_REASONS_OFFERED = REJECTION_REASONS.every((reason) =>
  REJECTION_REASON_OPTIONS.some((option) => option.value === reason),
)
