import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

export type AutoAcceptedProps = NotificationProps & {
  /** The same event reaches both sides (NOTI-2); only the sentence differs. */
  role: 'maker' | 'feedbacker'
}

export const AUTO_ACCEPTED_SUBJECT = 'A report was accepted automatically'

/** NOTI-2: FDBK-7's 72 hours ran out, so the clock decided. */
export function AutoAccepted(props: AutoAcceptedProps) {
  return (
    <NotificationShell
      {...props}
      preview="The 72-hour deadline passed"
      heading={`${props.displayName}, the deadline decided this one`}
      cta="See the report"
    >
      <Text style={{ margin: '0 0 20px' }}>
        {props.role === 'maker'
          ? 'A report on your project went 72 hours without an answer, so it was accepted and the credit went to the feedbacker.'
          : 'The maker did not answer within 72 hours, so your report was accepted and one credit was added to your balance.'}
      </Text>
    </NotificationShell>
  )
}
