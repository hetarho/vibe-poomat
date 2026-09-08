import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { requireSession } from '../../src/features/auth'
import { notificationPreferencesQueryOptions } from '../../src/features/notification-preferences'
import { SettingsPage } from '../../src/pages/settings'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * Owner-only, guarded before anything renders (T032): a signed-out person gets a
 * redirect from the server rather than a page that appears and then jumps.
 */
export const Route = createFileRoute('/settings')({
  beforeLoad: async ({ context, location }) => ({
    profile: await requireSession({ queryClient: context.queryClient, location }),
  }),
  loader: async ({ context }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    await context.queryClient.ensureQueryData(notificationPreferencesQueryOptions(headers))
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const { profile } = Route.useRouteContext()
  const navigate = useNavigate()

  return (
    <SettingsPage profile={profile} onDeleted={() => void navigate({ to: '/', replace: true })} />
  )
}
