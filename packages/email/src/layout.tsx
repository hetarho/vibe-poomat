import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'
import type { ReactNode } from 'react'

export const NO_REPLY_NOTICE = 'This mailbox does not accept replies.'

type EmailLayoutProps = {
  preview: string
  children: ReactNode
  /** Filled by the notification tasks with an unsubscribe link. */
  footer?: ReactNode
}

/** The shell every template renders inside, so the legal lines exist exactly once. */
export function EmailLayout({ preview, children, footer }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f6f6f6', margin: 0 }}>
        <Container style={{ backgroundColor: '#ffffff', padding: '32px', maxWidth: '560px' }}>
          <Section>{children}</Section>
          <Hr style={{ borderColor: '#e6e6e6', margin: '28px 0 16px' }} />
          <Text style={{ color: '#6b7280', fontSize: '12px', margin: 0 }}>{NO_REPLY_NOTICE}</Text>
          {footer === undefined ? null : <Section style={{ marginTop: '8px' }}>{footer}</Section>}
        </Container>
      </Body>
    </Html>
  )
}
