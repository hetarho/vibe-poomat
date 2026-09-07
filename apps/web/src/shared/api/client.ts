import { type ApiClient, createApiClient } from '@repo/api-client'
import { apiBaseUrl } from './base-url'

/**
 * An SSR render forwards the incoming cookie header, because the server has no
 * browser to attach it; the browser client relies on the cookie being same-site.
 */
export async function apiClient(headers?: Record<string, string>): Promise<ApiClient> {
  return createApiClient({
    baseUrl: await apiBaseUrl(),
    ...(headers === undefined ? {} : { headers }),
  })
}

export function forwardedHeaders(requestHeaders: Headers): Record<string, string> {
  const cookie = requestHeaders.get('cookie')

  return cookie === null ? {} : { cookie }
}
