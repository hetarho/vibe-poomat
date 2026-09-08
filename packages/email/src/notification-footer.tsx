import { Link, Text } from '@react-email/components'

export type NotificationFooterProps = {
  /**
   * Null for the one email NOTI-3 will not let anybody switch off. The footer
   * then says why, rather than showing a link that would refuse to work.
   */
  unsubscribeUrl: string | null
  /** Always present: every email can at least point at the settings page. */
  settingsUrl: string
}

const style = { color: '#6b7280', fontSize: '12px', margin: '4px 0 0' }

/**
 * NOTI-4's per-type unsubscribe line. It lives here rather than in each template
 * so the wording, and the promise it makes, is written exactly once.
 */
export function NotificationFooter({ unsubscribeUrl, settingsUrl }: NotificationFooterProps) {
  if (unsubscribeUrl === null) {
    return (
      <Text style={style}>
        This one email cannot be turned off, because it moves credits.{' '}
        <Link href={settingsUrl}>Manage your other notifications</Link>.
      </Text>
    )
  }

  return (
    <Text style={style}>
      <Link href={unsubscribeUrl}>Stop receiving this kind of email</Link>, or{' '}
      <Link href={settingsUrl}>manage all notifications</Link>.
    </Text>
  )
}
