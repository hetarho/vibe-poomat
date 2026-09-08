import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

export type FeedbackAcceptedProps = NotificationProps

export const FEEDBACK_ACCEPTED_SUBJECT = 'Your feedback was accepted'

/** NOTI-2: the maker said yes, so CRED-4 moved a credit to the feedbacker. */
export function FeedbackAccepted(props: FeedbackAcceptedProps) {
  return (
    <NotificationShell
      {...props}
      preview="One credit is on its way to you"
      heading={`${props.displayName}, your feedback landed`}
      cta="See the report"
    >
      <Text style={{ margin: '0 0 20px' }}>
        The maker accepted the report you wrote, and one credit has been added to your balance.
        Spend it on feedback for something you built.
      </Text>
    </NotificationShell>
  )
}
