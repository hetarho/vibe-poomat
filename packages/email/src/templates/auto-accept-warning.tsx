import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

export type AutoAcceptWarningProps = NotificationProps

export const AUTO_ACCEPT_WARNING_SUBJECT = 'You have 24 hours left to answer a report'

/** NOTI-2 and NOTI-3: the one email nobody may switch off, because it moves credits. */
export function AutoAcceptWarning(props: AutoAcceptWarningProps) {
  return (
    <NotificationShell
      {...props}
      preview="A report auto-accepts in 24 hours"
      heading={`${props.displayName}, a decision is about to be made for you`}
      cta="Decide now"
    >
      <Text style={{ margin: '0 0 20px' }}>
        A report on your project has been waiting for 48 hours. In 24 more it is accepted
        automatically and the credit goes to the feedbacker, exactly as if you had accepted it.
      </Text>
    </NotificationShell>
  )
}
