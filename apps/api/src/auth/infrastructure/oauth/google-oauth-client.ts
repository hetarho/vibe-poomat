import { err, ok, type Result } from '../../../shared/result'
import type {
  AuthorizationRequest,
  OAuthProviderClient,
  ProviderFetchError,
  ProviderProfile,
} from '../../application/oauth-provider'
import { ProviderExchangeFailedError } from '../../application/oauth-provider'
import type { ArcticGoogle, ArcticModule } from './arctic-module'

const SCOPES = ['openid', 'profile', 'email']

/**
 * The claims we read. `email_verified` is the one that matters: AUTH-5 links on
 * it, and Google does hand out accounts whose address it has not verified.
 */
type GoogleClaims = {
  sub?: unknown
  email?: unknown
  email_verified?: unknown
  name?: unknown
  picture?: unknown
}

export class GoogleOAuthClient implements OAuthProviderClient {
  private readonly google: ArcticGoogle

  constructor(
    private readonly arctic: ArcticModule,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
  ) {
    this.google = new arctic.Google(clientId, clientSecret, redirectUri)
  }

  createAuthorization(): AuthorizationRequest {
    const state = this.arctic.generateState()
    const codeVerifier = this.arctic.generateCodeVerifier()

    return {
      url: this.google.createAuthorizationURL(state, codeVerifier, SCOPES).toString(),
      state,
      codeVerifier,
    }
  }

  async fetchProfile(input: {
    code: string
    codeVerifier: string | null
  }): Promise<Result<ProviderProfile, ProviderFetchError>> {
    if (input.codeVerifier === null) {
      return err(new ProviderExchangeFailedError('the PKCE verifier for this sign-in is missing'))
    }

    let claims: GoogleClaims
    try {
      const tokens = await this.google.validateAuthorizationCode(input.code, input.codeVerifier)
      claims = this.arctic.decodeIdToken(tokens.idToken()) as GoogleClaims
    } catch {
      return err(new ProviderExchangeFailedError('Google rejected the authorization code'))
    }

    const sub = typeof claims.sub === 'string' ? claims.sub : ''
    const email = typeof claims.email === 'string' ? claims.email : ''
    if (sub === '' || email === '') {
      return err(new ProviderExchangeFailedError('Google returned an id token we cannot use'))
    }

    const name = typeof claims.name === 'string' && claims.name !== '' ? claims.name : email
    const picture = typeof claims.picture === 'string' ? claims.picture : null

    return ok({
      provider: 'google',
      providerUserId: sub,
      email,
      // AUTH-5: an unverified address links to nothing and starts its own account
      emailVerified: claims.email_verified === true,
      displayName: name,
      avatarUrl: picture,
      // Google has no username, so the local part of the address seeds the handle
      username: email.split('@')[0] ?? email,
    })
  }
}
