import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import {
  givenFeedbackQueryOptions,
  ownedProjectsQueryOptions,
  profileQueryOptions,
} from '../../src/entities/user'
import { ProfilePage } from '../../src/pages/profile'
import { forwardedHeaders } from '../../src/shared/api'

const EMPTY_PAGE = { items: [], nextCursor: null }

/**
 * AUTH-6's `/@handle`. Everything the page shows is resolved before the first
 * render, so the profile arrives complete rather than filling itself in — and a
 * handle nobody holds renders its own not-found instead of an error boundary.
 */
export const Route = createFileRoute('/@{$handle}')({
  loader: async ({ context, params }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined
    const profile = await context.queryClient.ensureQueryData(
      profileQueryOptions(params.handle, headers),
    )
    if (profile === null) return { profile: null }

    await Promise.all([
      context.queryClient.ensureQueryData(ownedProjectsQueryOptions(profile.id, headers)),
      context.queryClient.ensureQueryData(givenFeedbackQueryOptions(profile.id, headers)),
    ])

    return { profile }
  },
  component: ProfileRoute,
})

function ProfileRoute() {
  const { handle } = Route.useParams()
  const { profile } = Route.useLoaderData()
  const owned = useQuery({
    ...ownedProjectsQueryOptions(profile?.id ?? ''),
    enabled: profile !== null,
  })
  const given = useQuery({
    ...givenFeedbackQueryOptions(profile?.id ?? ''),
    enabled: profile !== null,
  })

  return (
    <ProfilePage
      profile={profile}
      handle={handle}
      projects={owned.data ?? EMPTY_PAGE}
      given={given.data ?? EMPTY_PAGE}
    />
  )
}
