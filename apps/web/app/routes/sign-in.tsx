import { createFileRoute } from '@tanstack/react-router'
import { SignInPage } from '../../src/pages/sign-in'

type SignInSearch = {
  error?: string
  returnTo?: string
}

/**
 * The callback redirects here with `?error=` when a sign-in fails, and the route
 * guard sends signed-out people here with `?returnTo=`. Both are read as plain
 * strings and validated where they are used, never trusted into a URL.
 */
export const Route = createFileRoute('/sign-in')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => ({
    ...(typeof search.error === 'string' ? { error: search.error } : {}),
    ...(typeof search.returnTo === 'string' ? { returnTo: search.returnTo } : {}),
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { error, returnTo } = Route.useSearch()

  return <SignInPage error={error} returnTo={returnTo} />
}
