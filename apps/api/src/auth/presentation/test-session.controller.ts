import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common'
import { ApiExcludeEndpoint } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { z } from 'zod'
import { Public, unwrap } from '../../shared/presentation'
import { SignInWithProviderUseCase } from '../application/sign-in-with-provider.use-case'
import { SESSION_COOKIE, sessionCookieOptions } from './auth-cookies'

/** Whatever the browser suite wants this fixture account to look like. */
const requestSchema = z.object({
  providerUserId: z.string().min(1).max(64),
  username: z.string().min(1).max(39),
  email: z.email(),
})

export const TEST_SESSION_PATH = 'test-support/session'

/**
 * The single sanctioned bypass of AUTH-1, and it exists only when
 * `NODE_ENV=test`: `TestSupportModule` is not imported at all otherwise, so
 * these routes are absent from the graph a production build boots — not merely
 * guarded inside it. An always-present backdoor would be worse than having no
 * browser suite at all.
 *
 * It skips exactly one thing: the round trip to GitHub or Google. Everything
 * after that is the same use case the real callback runs, so a session it issues
 * is indistinguishable from one somebody signed in for.
 */
@Controller()
export class TestSessionController {
  constructor(private readonly signIn: SignInWithProviderUseCase) {}

  @Post(TEST_SESSION_PATH)
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiExcludeEndpoint()
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ id: string; handle: string }> {
    const request = requestSchema.parse(body)
    const outcome = unwrap(
      await this.signIn.execute({
        profile: {
          provider: 'github',
          providerUserId: request.providerUserId,
          email: request.email,
          emailVerified: true,
          displayName: request.username,
          avatarUrl: null,
          username: request.username,
        },
      }),
    )

    reply.setCookie(SESSION_COOKIE, outcome.session.id.value, sessionCookieOptions)

    return { id: outcome.user.id.value, handle: outcome.user.handle.value }
  }
}
