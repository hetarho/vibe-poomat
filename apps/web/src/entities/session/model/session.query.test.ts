import { ApiError } from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.fn()

vi.mock('../../../shared/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../shared/api')

  return { ...actual, apiClient: vi.fn(async () => ({ GET: get })) }
})

const { apiClient } = await import('../../../shared/api')
const { fetchCurrentUser, SESSION_QUERY_KEY, sessionQueryOptions } = await import('./session.query')

describe('fetchCurrentUser', () => {
  beforeEach(() => {
    get.mockReset()
    vi.mocked(apiClient).mockClear()
  })

  it('answers with the account when there is a session', async () => {
    get.mockResolvedValue({ data: { handle: 'ada' } })

    expect(await fetchCurrentUser()).toMatchObject({ handle: 'ada' })
    expect(get).toHaveBeenCalledWith('/api/v1/auth/me')
  })

  /**
   * Signed out is an answer, not a failure. Throwing here would make every
   * consumer distinguish "not signed in" from "the api is down".
   */
  it('answers null when nobody is signed in', async () => {
    get.mockRejectedValue(new ApiError(401, { code: 'UNAUTHENTICATED', message: 'no session' }))

    expect(await fetchCurrentUser()).toBeNull()
  })

  it('lets a real failure through, so a broken api is not read as signed out', async () => {
    get.mockRejectedValue(new ApiError(503, { code: 'SERVICE_UNAVAILABLE', message: 'down' }))

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(ApiError)
  })

  it('lets something that is not an api error through untouched', async () => {
    get.mockRejectedValue(new TypeError('fetch failed'))

    await expect(fetchCurrentUser()).rejects.toBeInstanceOf(TypeError)
  })

  it('answers null for a 200 with no body, rather than undefined', async () => {
    get.mockResolvedValue({ data: undefined })

    expect(await fetchCurrentUser()).toBeNull()
  })

  /** SSR has no browser to attach the cookie, so it is forwarded by hand. */
  it('forwards the headers it is given, and none when it is given none', async () => {
    get.mockResolvedValue({ data: null })

    await fetchCurrentUser({ cookie: 'session=abc' })
    expect(apiClient).toHaveBeenCalledWith({ cookie: 'session=abc' })

    await fetchCurrentUser()
    expect(apiClient).toHaveBeenLastCalledWith(undefined)
  })
})

describe('sessionQueryOptions', () => {
  it('uses one key for the whole app, so nothing reads a second copy', () => {
    expect(sessionQueryOptions().queryKey).toEqual(SESSION_QUERY_KEY)
  })

  it('holds the answer long enough that every page does not refetch it', () => {
    expect(sessionQueryOptions().staleTime).toBeGreaterThan(60_000)
  })
})
