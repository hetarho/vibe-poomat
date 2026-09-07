import { ApiError } from '@repo/api-client'
import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from './query-client'
import { QUERY_RETRY_LIMIT, shouldRetryQuery } from './retry'

function apiError(status: number, code: string): ApiError {
  return new ApiError(status, { code, message: 'from the api' })
}

describe('shouldRetryQuery', () => {
  it.each([400, 401, 403, 404, 409, 422, 429])('never retries a %i', (status) => {
    expect(shouldRetryQuery(0, apiError(status, 'NOPE'))).toBe(false)
  })

  it('retries a 5xx once', () => {
    expect(shouldRetryQuery(0, apiError(500, 'INTERNAL'))).toBe(true)
    expect(shouldRetryQuery(QUERY_RETRY_LIMIT, apiError(500, 'INTERNAL'))).toBe(false)
  })

  it('retries a transport failure once', () => {
    expect(shouldRetryQuery(0, new TypeError('fetch failed'))).toBe(true)
    expect(shouldRetryQuery(QUERY_RETRY_LIMIT, new TypeError('fetch failed'))).toBe(false)
  })
})

describe('the query client defaults', () => {
  it('surfaces a 404 as an ApiError without asking again', async () => {
    const queryFn = vi.fn(async () => {
      throw apiError(404, 'PROJECT_NOT_FOUND')
    })
    const client = createQueryClient()

    const thrown = await client
      .fetchQuery({ queryKey: ['project', 'byId', 'x'], queryFn, retryDelay: 0 })
      .catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(ApiError)
    expect((thrown as ApiError).code).toBe('PROJECT_NOT_FOUND')
    expect(queryFn).toHaveBeenCalledTimes(1)
  })

  it('gives a 500 exactly one more chance', async () => {
    const queryFn = vi.fn(async () => {
      throw apiError(500, 'INTERNAL')
    })
    const client = createQueryClient()

    await client
      .fetchQuery({ queryKey: ['project', 'byId', 'y'], queryFn, retryDelay: 0 })
      .catch(() => undefined)

    expect(queryFn).toHaveBeenCalledTimes(1 + QUERY_RETRY_LIMIT)
  })

  it('never retries a mutation, so a side effect cannot double', () => {
    const client = createQueryClient()

    expect(client.getDefaultOptions().mutations?.retry).toBe(false)
  })

  it('keeps data fresh for 30 seconds', () => {
    expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(30_000)
  })
})
