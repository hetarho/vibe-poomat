import { Button, Heading } from '@react-email/components'
import type { ReactNode } from 'react'
import { EmailLayout } from '../layout'
import { NotificationFooter, type NotificationFooterProps } from '../notification-footer'

/** Everything every NOTI-2 email carries: who it is for, where it points, how to stop it. */
export type NotificationProps = NotificationFooterProps & {
  displayName: string
  /** NOTI-4: the deep link to the item this email is about. */
  ctaUrl: string
}

type ShellProps = NotificationProps & {
  preview: string
  heading: string
  cta: string
  children: ReactNode
}

/**
 * The one shape every notification email takes: a heading, a sentence or two,
 * one primary action, and the footer NOTI-4 requires. Templates supply the copy
 * and nothing else, which is what keeps NOTI-5's brand voice out of the api.
 */
export function NotificationShell({
  preview,
  heading,
  cta,
  ctaUrl,
  children,
  unsubscribeUrl,
  settingsUrl,
}: ShellProps) {
  return (
    <EmailLayout
      preview={preview}
      footer={<NotificationFooter unsubscribeUrl={unsubscribeUrl} settingsUrl={settingsUrl} />}
    >
      <Heading as="h1" style={{ fontSize: '20px', margin: '0 0 12px' }}>
        {heading}
      </Heading>
      {children}
      <Button
        href={ctaUrl}
        style={{
          backgroundColor: '#111827',
          borderRadius: '8px',
          color: '#ffffff',
          padding: '12px 18px',
        }}
      >
        {cta}
      </Button>
    </EmailLayout>
  )
}
