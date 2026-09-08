import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common'
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { auth } from '@repo/contracts'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ENV, type Env } from '../../shared/config/env.token'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { Public, unwrap } from '../../shared/presentation'
import { GetMyProfileUseCase } from '../application/get-my-profile.use-case'
import {
  OAUTH_PROVIDERS,
  type OAuthProviderRegistry,
  ProviderDeniedError,
  ProviderExchangeFailedError,
  StateMismatchError,
} from '../application/oauth-provider'
import { safeReturnTo } from '../application/return-to'
import { SignInWithProviderUseCase } from '../application/sign-in-with-provider.use-case'
import { SignOutUseCase } from '../application/sign-out.use-case'
import { AUTH_PROVIDERS, parseAuthProvider } from '../domain/auth-provider'
import { SessionId } from '../domain/session-id'
import {
  clearedOauthCookieOptions,
  clearedSessionCookieOptions,
  OAUTH_RETURN_TO_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_VERIFIER_COOKIE,
  oauthCookieOptions,
  SESSION_COOKIE,
  sessionCookieOptions,
} from './auth-cookies'
import { CurrentUser } from './current-user.decorator'

const FOUND = 302

/** Where a failed sign-in lands, with the code the page turns into its copy. */
export const SIGN_IN_PATH = '/sign-in'

/**
 * The state is a secret the browser hands back, so it is compared in constant
 * time. Lengths differing is itself public — an attacker already chose one.
 */
function timingSafeEqualStrings(expected: string, actual: string): boolean {
  if (expected.length !== actual.length) return false

  let difference = 0
  for (let index = 0; index < expected.length; index++) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index)
  }

  return difference === 0
}

/**
 * The two ends of the OAuth dance (AUTH-1). Both answer with a redirect rather
 * than JSON, because a browser is walking through them: a failure that rendered
 * an error body would leave the person staring at it instead of at the sign-in
 * page that can explain itself.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly signIn: SignInWithProviderUseCase,
    private readonly myProfile: GetMyProfileUseCase,
    private readonly signOut: SignOutUseCase,
    @Inject(OAUTH_PROVIDERS) private readonly providers: OAuthProviderRegistry,
    @Inject(ENV) private readonly config: Env,
  ) {}

  /**
   * Declared above `:provider` for the reader's sake; the router already
   * prefers a static segment over a parameter, and a test pins that down.
   */
  @Get('me')
  @ApiOperation({ summary: "The signed-in account's own profile" })
  async me(@CurrentUser() userId: string): Promise<auth.Me> {
    const profile = unwrap(await this.myProfile.execute(userId))
    const { user } = profile

    return {
      id: user.id.value,
      handle: user.handle.value,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio?.value ?? null,
      link: user.link?.value ?? null,
      createdAt: user.createdAt.toISOString(),
      email: profile.email,
      providers: profile.providers,
    }
  }

  /**
   * Public on purpose: signing out must work whatever state the cookie is in,
   * and telling a browser holding a dead cookie that it is not signed in enough
   * to sign out would be an absurd place to draw a line.
   */
  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Delete the session and clear the cookie' })
  async logout(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<undefined> {
    const parsed = SessionId.parse(request.cookies?.[SESSION_COOKIE] ?? '')
    await this.signOut.execute(parsed.isOk() ? parsed.value : null)

    reply.setCookie(SESSION_COOKIE, '', clearedSessionCookieOptions)
    reply.status(HttpStatus.NO_CONTENT).send()

    return undefined
  }

  @Get(':provider')
  @Public()
  @Throttle({ [WRITE_THROTTLER]: {} })
  // the document has to say 302: these endpoints never return a body, and a
  // generated client that expected one would be wrong about every call
  @ApiOperation({ summary: 'Start sign-in by redirecting to the provider' })
  @ApiParam({ name: 'provider', enum: AUTH_PROVIDERS })
  @ApiResponse({ status: FOUND, description: "The provider's authorize URL" })
  start(
    @Param('provider') provider: string,
    @Query('returnTo') returnTo: string | undefined,
    @Res() reply: FastifyReply,
  ): undefined {
    const parsed = parseAuthProvider(provider)
    if (parsed.isErr()) return this.failWith(reply, parsed.error.code)

    const client = this.providers.clientFor(parsed.value)
    if (client.isErr()) return this.failWith(reply, client.error.code)

    const authorization = client.value.createAuthorization()

    reply.setCookie(OAUTH_STATE_COOKIE, authorization.state, oauthCookieOptions)
    reply.setCookie(OAUTH_RETURN_TO_COOKIE, safeReturnTo(returnTo), oauthCookieOptions)
    if (authorization.codeVerifier !== null) {
      reply.setCookie(OAUTH_VERIFIER_COOKIE, authorization.codeVerifier, oauthCookieOptions)
    }

    reply.redirect(authorization.url, FOUND)

    return undefined
  }

  @Get(':provider/callback')
  @Public()
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Finish sign-in and issue the session cookie' })
  @ApiParam({ name: 'provider', enum: AUTH_PROVIDERS })
  @ApiResponse({
    status: FOUND,
    description: 'Where the sign-in started, or the sign-in page with an error code',
  })
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') providerError: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<undefined> {
    const cookies = request.cookies ?? {}
    const returnTo = safeReturnTo(cookies[OAUTH_RETURN_TO_COOKIE])
    // whatever happens next, this browser is done with the round trip
    this.clearOauthCookies(reply)

    const parsed = parseAuthProvider(provider)
    if (parsed.isErr()) return this.failWith(reply, parsed.error.code)

    // checked before anything else is even looked at: without it everything
    // below would be acting on a round trip somebody else started
    const expectedState = cookies[OAUTH_STATE_COOKIE]
    const stateMatches =
      expectedState !== undefined &&
      state !== undefined &&
      timingSafeEqualStrings(expectedState, state)
    if (!stateMatches) {
      return this.failWith(reply, new StateMismatchError('this sign-in did not start here').code)
    }

    if (providerError !== undefined) {
      return this.failWith(reply, new ProviderDeniedError('the provider refused sign-in').code)
    }

    if (code === undefined || code === '') {
      const missing = new ProviderExchangeFailedError('the provider sent no authorization code')

      return this.failWith(reply, missing.code)
    }

    const client = this.providers.clientFor(parsed.value)
    if (client.isErr()) return this.failWith(reply, client.error.code)

    const profile = await client.value.fetchProfile({
      code,
      codeVerifier: cookies[OAUTH_VERIFIER_COOKIE] ?? null,
    })
    if (profile.isErr()) return this.failWith(reply, profile.error.code)

    const previous = SessionId.parse(cookies[SESSION_COOKIE] ?? '')
    const outcome = await this.signIn.execute({
      profile: profile.value,
      previousSessionId: previous.isOk() ? previous.value : null,
    })
    if (outcome.isErr()) return this.failWith(reply, outcome.error.code)

    reply.setCookie(SESSION_COOKIE, outcome.value.session.id.value, sessionCookieOptions)
    reply.redirect(`${this.config.WEB_URL}${returnTo}`, FOUND)

    return undefined
  }

  private clearOauthCookies(reply: FastifyReply): void {
    for (const name of [OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE, OAUTH_RETURN_TO_COOKIE]) {
      reply.setCookie(name, '', clearedOauthCookieOptions)
    }
  }

  /** Returns `undefined` so a caller can `return` it and read as one step. */
  private failWith(reply: FastifyReply, code: string): undefined {
    const target = new URL(`${this.config.WEB_URL}${SIGN_IN_PATH}`)
    target.searchParams.set('error', code)

    reply.redirect(target.toString(), FOUND)

    return undefined
  }
}
