import { err, ok, type Result } from '../../../shared/result'
import type {
  AuthorizationRequest,
  OAuthProviderClient,
  ProviderFetchError,
  ProviderProfile,
} from '../../application/oauth-provider'
import {
  ProviderEmailUnverifiedError,
  ProviderExchangeFailedError,
} from '../../application/oauth-provider'
import type { ArcticGitHub, ArcticModule } from './arctic-module'

/** `user:email` is what makes the second call below possible at all. */
const SCOPES = ['read:user', 'user:email']

const API = 'https://api.github.com'
const USER_AGENT = 'vibe-poomat'
const TIMEOUT_MS = 10_000

type GitHubUser = {
  id: number
  login: string
  name: string | null
  avatar_url: string | null
}

type GitHubEmail = {
  email: string
  primary: boolean
  verified: boolean
}

export class GitHubOAuthClient implements OAuthProviderClient {
  private readonly github: ArcticGitHub

  constructor(
    private readonly arctic: ArcticModule,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    this.github = new arctic.GitHub(clientId, clientSecret, redirectUri)
  }

  createAuthorization(): AuthorizationRequest {
    const state = this.arctic.generateState()

    return {
      url: this.github.createAuthorizationURL(state, SCOPES).toString(),
      state,
      // GitHub's OAuth app flow has no PKCE; the state cookie is the whole defence
      codeVerifier: null,
    }
  }

  async fetchProfile(input: {
    code: string
  }): Promise<Result<ProviderProfile, ProviderFetchError>> {
    let accessToken: string
    try {
      accessToken = (await this.github.validateAuthorizationCode(input.code)).accessToken()
    } catch {
      return err(new ProviderExchangeFailedError('GitHub rejected the authorization code'))
    }

    let user: GitHubUser
    let emails: GitHubEmail[]
    try {
      ;[user, emails] = await Promise.all([
        this.get<GitHubUser>('/user', accessToken),
        this.get<GitHubEmail[]>('/user/emails', accessToken),
      ])
    } catch {
      return err(new ProviderExchangeFailedError('GitHub would not tell us who signed in'))
    }

    // the primary one if it is verified, otherwise any verified one: an address
    // we cannot trust would create an account AUTH-5 could never link later
    const email =
      emails.find((candidate) => candidate.primary && candidate.verified) ??
      emails.find((candidate) => candidate.verified)
    if (email === undefined) {
      return err(
        new ProviderEmailUnverifiedError('this GitHub account has no verified email address'),
      )
    }

    return ok({
      provider: 'github',
      providerUserId: String(user.id),
      email: email.email,
      emailVerified: true,
      displayName: user.name ?? user.login,
      avatarUrl: user.avatar_url,
      username: user.login,
    })
  }

  private async get<T>(path: string, accessToken: string): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': USER_AGENT,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`GitHub ${path} answered ${response.status}`)

    return (await response.json()) as T
  }
}
