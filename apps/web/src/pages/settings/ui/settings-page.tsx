import type { auth } from '@repo/contracts'
import { HandleForm } from '../../../features/change-handle'
import { DeleteAccountSection } from '../../../features/delete-account'
import { ProfileForm } from '../../../features/edit-profile'
import { NotificationToggles } from '../../../features/notification-preferences'

export const SETTINGS_HEADING = 'Settings'

type SettingsPageProps = {
  profile: auth.Me
  onDeleted: () => void
}

/**
 * Everything an account owns about itself, in the order somebody would go
 * looking: who they are, what they are called, what reaches them, and the way
 * out. The email is shown because AUTH-4 keeps it for notifications and this is
 * the one page where its owner may see it — it appears nowhere public.
 */
export function SettingsPage({ profile, onDeleted }: SettingsPageProps) {
  return (
    <div className="flex max-w-xl flex-col gap-10">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{SETTINGS_HEADING}</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Signed in as <span className="font-mono">{profile.email}</span> through{' '}
          {profile.providers.join(' and ')}.
        </p>
      </header>

      <ProfileForm profile={profile} />
      <HandleForm handle={profile.handle} />

      <section aria-labelledby="notifications-heading">
        <h2 id="notifications-heading" className="font-medium text-sm">
          Notifications
        </h2>
        <p className="mt-1 mb-3 text-muted-foreground text-sm">
          One email per event, never a digest.
        </p>
        <NotificationToggles />
      </section>

      <DeleteAccountSection handle={profile.handle} onDeleted={onDeleted} />
    </div>
  )
}
