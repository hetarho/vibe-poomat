import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

/** FDBK-6's fixed list, said in a sentence rather than a slug. */
const REASON_COPY = {
  task_not_done: 'the task was not actually done',
  no_substance: 'the report had nothing to act on',
  spam_abuse: 'the report was spam or abuse',
} as const

export type RejectionReasonKey = keyof typeof REASON_COPY

export type FeedbackRejectedProps = NotificationProps & {
  /** Null only for a rejection recorded before FDBK-6 fixed the list. */
  reason: RejectionReasonKey | null
}

export const FEEDBACK_REJECTED_SUBJECT = 'Your feedback was rejected'

/** NOTI-2: the maker said no, with the reason FDBK-6 makes them pick. */
export function FeedbackRejected(props: FeedbackRejectedProps) {
  return (
    <NotificationShell
      {...props}
      preview="The maker rejected your report"
      heading={`${props.displayName}, a report of yours was rejected`}
      cta="Read the decision"
    >
      <Text style={{ margin: '0 0 12px' }}>
        The maker rejected the report you wrote
        {props.reason === null ? '' : `, saying that ${REASON_COPY[props.reason]}`}. The credit went
        back to them, and the report stays public with that reason attached.
      </Text>
      <Text style={{ margin: '0 0 20px' }}>
        You can reply in the thread. A maker who rejects a lot carries that on their profile.
      </Text>
    </NotificationShell>
  )
}
