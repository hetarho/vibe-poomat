import type { Env } from '../../../shared/config/env.token'
import { err, ok, type Result } from '../../../shared/result'
import type { OAuthProviderClient, OAuthProviderRegistry } from '../../application/oauth-provider'
import { ProviderNotConfiguredError } from '../../application/oauth-provider'
import type { AuthProvider } from '../../domain/auth-provider'
import { type ArcticModule, loadArctic } from './arctic-module'
import { GitHubOAuthClient } from './github-oauth-client'
import { GoogleOAuthClient } from './google-oauth-client'

/** Must match what is registered with the provider, character for character. */
export function callbackUrlFor(config: Env, provider: AuthProvider): string {
  const base = config.OAUTH_REDIRECT_BASE_URL ?? config.API_URL

  return `${base.replace(/\/+$/, '')}/api/v1/auth/${provider}/callback`
}

/**
 * Builds a client per provider from config, once at construction. A provider
 * with no credentials is simply absent, and asking for it is a domain error the
 * controller turns into the sign-in page's "not configured" message rather than
 * a 500 — a checkout without OAuth apps still has to boot (ARCH-31).
 */
export class ArcticOAuthRegistry implements OAuthProviderRegistry {
  private readonly clients: Partial<Record<AuthProvider, OAuthProviderClient>>

  /** The one async step, taken while the module is wiring its providers. */
  static async create(config: Env): Promise<ArcticOAuthRegistry> {
    return new ArcticOAuthRegistry(await loadArctic(), config)
  }

  constructor(arctic: ArcticModule, config: Env) {
    this.clients = {}

    if (config.GITHUB_CLIENT_ID !== undefined && config.GITHUB_CLIENT_SECRET !== undefined) {
      this.clients.github = new GitHubOAuthClient(
        arctic,
        config.GITHUB_CLIENT_ID,
        config.GITHUB_CLIENT_SECRET,
        callbackUrlFor(config, 'github'),
      )
    }

    if (config.GOOGLE_CLIENT_ID !== undefined && config.GOOGLE_CLIENT_SECRET !== undefined) {
      this.clients.google = new GoogleOAuthClient(
        arctic,
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        callbackUrlFor(config, 'google'),
      )
    }
  }

  clientFor(provider: AuthProvider): Result<OAuthProviderClient, ProviderNotConfiguredError> {
    const client = this.clients[provider]
    if (client === undefined) {
      return err(
        new ProviderNotConfiguredError('this sign-in provider is not configured', { provider }),
      )
    }

    return ok(client)
  }
}
