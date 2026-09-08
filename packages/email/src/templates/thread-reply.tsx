import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

export type ThreadReplyProps = NotificationProps

export const THREAD_REPLY_SUBJECT = 'New reply on a feedback thread'

/** NOTI-2: the other participant of FDBK-5's two-party thread said something. */
export function ThreadReply(props: ThreadReplyProps) {
  return (
    <NotificationShell
      {...props}
      preview="Somebody replied in a thread you are part of"
      heading={`${props.displayName}, there is a new reply`}
      cta="Open the thread"
    >
      <Text style={{ margin: '0 0 20px' }}>
        The other side of a feedback thread you are part of has written back. Threads stay open
        after a decision, so this works whether the report was accepted or rejected.
      </Text>
    </NotificationShell>
  )
}
