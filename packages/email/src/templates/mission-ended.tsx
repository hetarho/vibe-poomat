import { Text } from '@react-email/components'
import { type NotificationProps, NotificationShell } from './notification-shell'

const ENDING_COPY = {
  completed: 'every slot was filled and settled',
  expired: 'it ran to the end of its window',
  closed: 'you closed it',
} as const

export type MissionEndingKey = keyof typeof ENDING_COPY

export type MissionEndedProps = NotificationProps & {
  ending: MissionEndingKey
  /** CRED-5: slots nobody took come back as credits. */
  refundedSlots: number
}

export const MISSION_ENDED_SUBJECT = 'Your mission has ended'

/** NOTI-2: a mission stopped taking feedback, with the refund summary. */
export function MissionEnded(props: MissionEndedProps) {
  return (
    <NotificationShell
      {...props}
      preview="Your mission stopped taking feedback"
      heading={`${props.displayName}, your mission has ended`}
      cta="Open your project"
    >
      <Text style={{ margin: '0 0 12px' }}>
        The mission on your project has ended because {ENDING_COPY[props.ending]}.
      </Text>
      <Text style={{ margin: '0 0 20px' }}>
        {props.refundedSlots === 0
          ? 'No slots went unfilled, so nothing was refunded.'
          : `${props.refundedSlots} unfilled ${props.refundedSlots === 1 ? 'slot was' : 'slots were'} refunded to your balance.`}
      </Text>
    </NotificationShell>
  )
}
