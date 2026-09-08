import { Body, Controller, Delete, HttpStatus, Res } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { auth as contract } from '@repo/contracts'
import type { FastifyReply } from 'fastify'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import {
  CurrentUser,
  clearedSessionCookieOptions,
  SESSION_COOKIE,
  unwrap,
} from '../../shared/presentation'
import { DeleteAccountUseCase } from '../application/delete-account.use-case'

class DeleteAccountDto extends createZodDto(contract.deleteAccountRequestSchema) {}

/**
 * AUTH-9's one route. It sits beside the profile routes at `/users/me` because
 * that is where the account is, but the use case behind it belongs to no single
 * context — which is why this controller is not in `auth`.
 *
 * There is no admin path (AUTH-12): the only actor this accepts is the account
 * itself, identified by the session.
 */
@Controller('users')
export class AccountController {
  constructor(private readonly deletion: DeleteAccountUseCase) {}

  @Delete('me')
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Delete your account, irreversibly and immediately' })
  async deleteMe(
    @CurrentUser() userId: string,
    @Body() body: DeleteAccountDto,
    @Res() reply: FastifyReply,
  ): Promise<undefined> {
    unwrap(await this.deletion.execute({ userId, confirm: body.confirm }))

    // the sessions are gone from the database already; this stops the browser
    // presenting a cookie that can never match anything again
    reply.setCookie(SESSION_COOKIE, '', clearedSessionCookieOptions)
    reply.status(HttpStatus.NO_CONTENT).send()

    return undefined
  }
}
