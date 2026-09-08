import { Body, Controller, Get, Inject, Patch, Query, Res } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { notifications as contract } from '@repo/contracts'
import type { FastifyReply } from 'fastify'
import { createZodDto } from 'nestjs-zod'
import { ENV, type Env } from '../../shared/config/env.token'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, unwrap } from '../../shared/presentation'
import type { PreferenceView } from '../application/notification-preferences.use-case'
import { NotificationPreferencesUseCase } from '../application/notification-preferences.use-case'

class UpdatePreferencesDto extends createZodDto(
  contract.updateNotificationPreferencesRequestSchema,
) {}

function render(views: PreferenceView[]): contract.NotificationPreferences {
  return { items: views }
}

/**
 * NOTI-3's toggles and NOTI-4's unsubscribe link. The two live together because
 * they change the same rows, but they are reached very differently: the toggles
 * need a session, and the link is clicked from a mail client with none.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly preferences: NotificationPreferencesUseCase,
    @Inject(ENV) private readonly config: Env,
  ) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Your notification toggles' })
  async list(@CurrentUser() userId: string): Promise<contract.NotificationPreferences> {
    return render(await this.preferences.list(userId))
  }

  @Patch('preferences')
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Turn a notification type on or off' })
  async update(
    @CurrentUser() userId: string,
    @Body() body: UpdatePreferencesDto,
  ): Promise<contract.NotificationPreferences> {
    return render(unwrap(await this.preferences.update(userId, body)))
  }

  /**
   * NOTI-4. Public by necessity — the click comes from an inbox — and safe
   * because the token is the whole authority and can only turn one type off.
   *
   * It answers with a redirect rather than JSON: whoever clicked is a person
   * looking at a mail client, not a client library, and they should land on the
   * page that shows them what just changed.
   */
  @Get('unsubscribe')
  @Public()
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Turn one notification type off from an email link' })
  @ApiQuery({ name: 'token', required: true })
  async unsubscribe(@Query('token') token: string, @Res() reply: FastifyReply): Promise<void> {
    const done = unwrap(await this.preferences.unsubscribe(token ?? ''))
    const target = new URL('/settings/notifications', this.config.WEB_URL)
    target.searchParams.set('unsubscribed', done.type)

    await reply.redirect(target.toString(), 303)
  }
}
