import { err, ok, type Result } from '../../shared/result'
import { UnknownProviderError } from './auth-errors'

/** The only two ways into the product (AUTH-1). No local credentials exist. */
export const AUTH_PROVIDERS = ['github', 'google'] as const

export type AuthProvider = (typeof AUTH_PROVIDERS)[number]

export function parseAuthProvider(value: string): Result<AuthProvider, UnknownProviderError> {
  if (!AUTH_PROVIDERS.includes(value as AuthProvider)) {
    return err(new UnknownProviderError('unknown sign-in provider', { provider: value }))
  }

  return ok(value as AuthProvider)
}
