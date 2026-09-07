import { Button, Heading, Text } from '@react-email/components'
import { EmailLayout } from '../layout'

export type AccountWelcomeProps = {
  displayName: string
  ctaUrl: string
}

export const ACCOUNT_WELCOME_SUBJECT = 'Welcome to vibe poomat'

export function AccountWelcome({ displayName, ctaUrl }: AccountWelcomeProps) {
  return (
    <EmailLayout preview="Your vibe poomat account is ready">
      <Heading as="h1" style={{ fontSize: '20px', margin: '0 0 12px' }}>
        Welcome, {displayName}
      </Heading>
      <Text style={{ margin: '0 0 20px' }}>
        Post what you built, spend credits to have people actually use it, and earn credits by
        giving feedback that lands.
      </Text>
      <Button
        href={ctaUrl}
        style={{
          backgroundColor: '#111827',
          borderRadius: '8px',
          color: '#ffffff',
          padding: '12px 18px',
        }}
      >
        Open vibe poomat
      </Button>
    </EmailLayout>
  )
}
