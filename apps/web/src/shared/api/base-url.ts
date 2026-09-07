import { createServerOnlyFn } from '@tanstack/react-start'

/**
 * On the server the api is reached at its own URL; in the browser it is
 * same-origin behind the reverse proxy (ARCH-30), so the base is empty and the
 * session cookie stays same-site (ARCH-18).
 */
const serverBaseUrl = createServerOnlyFn(async (): Promise<string> => {
  const { webEnv } = await import('@repo/config/web')

  return webEnv.API_URL
})

export async function apiBaseUrl(): Promise<string> {
  if (!import.meta.env.SSR) return ''

  return serverBaseUrl()
}
