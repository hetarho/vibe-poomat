import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { auth } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { Public, unwrap } from '../../shared/presentation'
import { GetPublicProfileUseCase } from '../application/get-public-profile.use-case'
import type { PublicProfileView } from '../application/profile-view'
import { ChangeHandleUseCase, UpdateProfileUseCase } from '../application/update-profile.use-case'
import { CurrentUser } from './current-user.decorator'

class UpdateProfileDto extends createZodDto(auth.updateProfileRequestSchema) {}
class ChangeHandleDto extends createZodDto(auth.changeHandleRequestSchema) {}

/** The one place a view becomes a response, so every route renders it alike. */
function render(view: PublicProfileView): auth.PublicProfile {
  return { ...view, createdAt: view.createdAt.toISOString() }
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly publicProfile: GetPublicProfileUseCase,
    private readonly updateProfile: UpdateProfileUseCase,
    private readonly changeHandle: ChangeHandleUseCase,
  ) {}

  /**
   * Keyed by handle so the web route `/@handle` needs no id lookup (AUTH-6). The
   * response is built by the same function the owner's own view starts from, so
   * the email cannot leak here by omission — it is added later, or not at all.
   */
  @Get('by-handle/:handle')
  @Public()
  @ApiOperation({ summary: 'The public profile behind a handle' })
  async byHandle(@Param('handle') handle: string): Promise<auth.PublicProfile> {
    return render(unwrap(await this.publicProfile.execute(handle)))
  }

  @Patch('me')
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Edit your own profile' })
  async patchMe(
    @CurrentUser() userId: string,
    @Body() body: UpdateProfileDto,
  ): Promise<auth.PublicProfile> {
    return render(unwrap(await this.updateProfile.execute({ userId, ...body })))
  }

  /**
   * Separate from the patch above because it is a separate decision: AUTH-6
   * frees the old handle the moment this commits and redirects nothing from it.
   */
  @Patch('me/handle')
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Change your handle' })
  async patchMyHandle(
    @CurrentUser() userId: string,
    @Body() body: ChangeHandleDto,
  ): Promise<auth.PublicProfile> {
    return render(unwrap(await this.changeHandle.execute({ userId, handle: body.handle })))
  }
}
