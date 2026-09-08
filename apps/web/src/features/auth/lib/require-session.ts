import type { QueryClient } from '@tanstack/react-query'
import { redirect } from '@tanstack/react-router'
import { type CurrentUser, sessionQueryOptions } from '../../../entities/session'
import { SIGN_IN_PATH } from './provider-url'

type GuardInput = {
  queryClient: QueryClient
  /** Where the person is trying to go, so sign-in can send them back. */
  location: { href: string }
}

/**
 * A `beforeLoad` guard rather than a component, deliberately: it runs on the
 * server during SSR, so a signed-out person gets a real redirect instead of a
 * page that renders and then jumps. The first paint is never the wrong one.
 *
 * Returns the account when there is one, so a route that guards itself also has
 * the user without asking twice.
 */
export async function requireSession(input: GuardInput): Promise<CurrentUser> {
  const user = await input.queryClient.ensureQueryData(sessionQueryOptions())
  if (user !== null) return user

  throw redirect({
    to: SIGN_IN_PATH,
    search: { returnTo: input.location.href },
  })
}
