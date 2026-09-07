import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiErrorFrom, INTERNAL_ERROR_CODE } from './api-error'
import { createApiClient } from './client'

const BASE_URL = 'http://api.test'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function clientReturning(response: Response) {
  // matches the global fetch signature the client option declares
  const fetch = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
    response.clone(),
  )

  return { client: createApiClient({ baseUrl: BASE_URL, fetch }), fetch }
}

describe('createApiClient', () => {
  it('passes a 2xx body through as typed data', async () => {
    const { client } = clientReturning(jsonResponse(200, { status: 'ok' }))

    const { data } = await client.GET('/health')

    expect(data).toEqual({ status: 'ok' })
  })

  it('sends credentials, so the session cookie travels with every call', async () => {
    const { client, fetch } = clientReturning(jsonResponse(200, { status: 'ok' }))

    await client.GET('/health')

    const [input] = fetch.mock.calls[0] ?? []
    if (!(input instanceof Request)) throw new Error('openapi-fetch should send a Request')

    expect(input.credentials).toBe('include')
    expect(input.url).toBe(`${BASE_URL}/health`)
  })

  it('throws a typed ApiError for a domain error body', async () => {
    const { client } = clientReturning(
      jsonResponse(404, { code: 'PROJECT_NOT_FOUND', message: 'project not found' }),
    )

    const thrown = await client.GET('/health').catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      message: 'project not found',
    })
  })

  it('keeps validation details on the thrown error', async () => {
    const { client } = clientReturning(
      jsonResponse(422, {
        code: 'VALIDATION_FAILED',
        message: 'request validation failed',
        details: { title: ['required'] },
      }),
    )

    const thrown = (await client.GET('/health').catch((error: unknown) => error)) as ApiError

    expect(thrown.details).toEqual({ title: ['required'] })
  })

  it('turns a non-JSON failure into an INTERNAL ApiError', async () => {
    const { client } = clientReturning(
      new Response('<html>Bad Gateway</html>', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )

    const thrown = (await client.GET('/health').catch((error: unknown) => error)) as ApiError

    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown.code).toBe(INTERNAL_ERROR_CODE)
    expect(thrown.status).toBe(500)
  })
})

describe('apiErrorFrom', () => {
  it('rejects a body that only looks like an error body', async () => {
    const error = await apiErrorFrom(jsonResponse(400, { code: '', message: 'x' }))

    expect(error.code).toBe(INTERNAL_ERROR_CODE)
  })

  it('falls back to a readable message when there is no status text', async () => {
    const error = await apiErrorFrom(new Response('', { status: 502, statusText: '' }))

    expect(error.message).toBe('request failed')
  })
})
