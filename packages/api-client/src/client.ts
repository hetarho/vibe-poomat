import createOpenApiClient, { type Client, type Middleware } from 'openapi-fetch'
import { apiErrorFrom } from './api-error'
import type { paths } from './schema'

export type ApiClient = Client<paths>

export type ApiClientOptions = {
  baseUrl: string
  /** Injectable so a test, or SSR, can supply its own. */
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string>
}

/** Turns any non-2xx answer into a thrown ApiError before the caller sees it. */
export const errorMiddleware: Middleware = {
  async onResponse({ response }) {
    if (response.ok) return response

    throw await apiErrorFrom(response)
  },
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const client = createOpenApiClient<paths>({
    baseUrl: options.baseUrl,
    // the session lives in an httpOnly cookie (ARCH-18), so it must be sent
    credentials: 'include',
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.headers === undefined ? {} : { headers: options.headers }),
  })
  client.use(errorMiddleware)

  return client
}
