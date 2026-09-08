import { Controller, Delete, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { feedback } from '@repo/contracts'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, unwrap } from '../../shared/presentation'
import { ClaimSlotUseCase } from '../application/claim-slot.use-case'
import type { ClaimView } from '../application/claim-view'

function render(view: ClaimView): feedback.Claim {
  return {
    ...view,
    heldUntil: view.heldUntil.toISOString(),
    releasedAt: view.releasedAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
  }
}

/** Pressing Start, and changing your mind about it (FDBK-1). */
@Controller()
export class ClaimsController {
  constructor(private readonly claims: ClaimSlotUseCase) {}

  @Post('missions/:missionId/claims')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Hold a slot on this mission for 24 hours' })
  async claim(
    @Param('missionId') missionId: string,
    @CurrentUser() actorId: string,
  ): Promise<feedback.Claim> {
    return render(unwrap(await this.claims.claim({ missionId, actorId })))
  }

  @Delete('claims/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Give your slot back before submitting' })
  async release(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    unwrap(await this.claims.release({ claimId: id, actorId }))
  }
}
