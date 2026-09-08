import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { credits } from '@repo/contracts'
import { CurrentUser } from '../../shared/presentation/current-user.decorator'
import { GetMyCreditsUseCase } from '../application/get-my-credits.use-case'

/**
 * The owner's own ledger and nobody else's (CRED-7). There is no write endpoint
 * at all: credits move only through the named operations other contexts call,
 * and there is no adjustment path for anyone (CRED-10).
 */
@Controller('credits')
export class CreditsController {
  constructor(private readonly myCredits: GetMyCreditsUseCase) {}

  @Get('me')
  @ApiOperation({ summary: 'Your balance, escrow and ledger entries, newest first' })
  async me(
    @CurrentUser() accountId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<credits.MyCredits> {
    const view = await this.myCredits.execute({
      accountId,
      cursor,
      limit: limit === undefined ? undefined : Number(limit),
    })

    return {
      balance: view.balance,
      escrowed: view.escrowed,
      received: view.received,
      given: view.given,
      ledger: {
        items: view.ledger.entries.map((entry) => ({
          id: entry.id,
          type: entry.type,
          balanceDelta: entry.balanceDelta,
          escrowDelta: entry.escrowDelta,
          refType: entry.refType,
          refId: entry.refId,
          createdAt: entry.createdAt.toISOString(),
        })),
        nextCursor: view.ledger.nextCursor,
      },
    }
  }
}
