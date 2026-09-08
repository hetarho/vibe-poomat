import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

export type FeedbackReceivedProps = NotificationProps

export const FEEDBACK_RECEIVED_SUBJECT = 'Someone left feedback on your project'

/** NOTI-2: a report landed and the maker has 72 hours to answer it (FDBK-7). */
export function FeedbackReceived(props: FeedbackReceivedProps) {
  return (
    <NotificationShell
      {...props}
      preview="A new report is waiting on your decision"
      heading={`${props.displayName}, someone used your project`}
      cta="Read the feedback"
    >
      <Text style={{ margin: '0 0 20px' }}>
        A feedbacker finished your task and turned in a report. Accept it and the credit goes to
        them; reject it with a reason and the credit comes back to you. If you do neither within 72
        hours it is accepted for you.
      </Text>
    </NotificationShell>
  )
}
