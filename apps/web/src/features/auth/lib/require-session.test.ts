import { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../../../entities/session'
import { SESSION_QUERY_KEY } from '../../../entities/session'
import { requireSession } from './require-session'

const ADA = { id: 'a', handle: 'ada', displayName: 'Ada' } as unknown as CurrentUser

function clientWith(user: CurrentUser | null): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, user)

  return client
}

describe('requireSession', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  describe('signed in', () => {
    it('lets the page through, and hands back the account', async () => {
      const user = await requireSession({
        queryClient: clientWith(ADA),
        location: { href: '/settings' },
      })

      expect(user.handle).toBe('ada')
    })

    /** The route that guards itself already has the user, so it asks once. */
    it('does not fetch again when the session is already resolved', async () => {
      const client = clientWith(ADA)
      const fetchSpy = vi.spyOn(globalThis, 'fetch')

      await requireSession({ queryClient: client, location: { href: '/settings' } })

      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })

  describe('signed out', () => {
    /** The router recognises what is thrown, which is what makes it a redirect. */
    async function refusal(href: string): Promise<unknown> {
      return requireSession({ queryClient: clientWith(null), location: { href } }).catch(
        (error: unknown) => error,
      )
    }

    it('redirects to sign-in rather than rendering the page', async () => {
      const thrown = await refusal('/settings')

      expect(isRedirect(thrown)).toBe(true)
      expect((thrown as { options: { to: string } }).options.to).toBe('/sign-in')
    })

    it('carries where they were going, so sign-in can send them back', async () => {
      const thrown = (await refusal('/projects/abc/missions?tab=open')) as {
        options: { search: { returnTo: string } }
      }

      expect(thrown.options.search.returnTo).toBe('/projects/abc/missions?tab=open')
    })

    it('throws rather than resolving, so nothing downstream runs', async () => {
      await expect(
        requireSession({ queryClient: clientWith(null), location: { href: '/settings' } }),
      ).rejects.toBeDefined()
    })
  })
})
