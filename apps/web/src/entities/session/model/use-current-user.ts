import { useQuery } from '@tanstack/react-query'
import { type CurrentUser, sessionQueryOptions } from './session.query'

/**
 * Null when signed out, and never undefined: the query is prefetched during SSR,
 * so the first paint already knows. A component that had to render a "loading"
 * state here would be a flash of the wrong header on every page.
 */
export function useCurrentUser(): CurrentUser | null {
  const { data } = useQuery(sessionQueryOptions())

  return data ?? null
}
