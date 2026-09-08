import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { feedback as contract } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, unwrap } from '../../shared/presentation'
import type { FeedbackView } from '../application/feedback-view'
import { ReadFeedbackUseCase } from '../application/read-feedback.use-case'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import { SubmitFeedbackUseCase } from '../application/submit-feedback.use-case'

class SubmitFeedbackDto extends createZodDto(contract.submitFeedbackRequestSchema) {}
class RejectFeedbackDto extends createZodDto(contract.rejectFeedbackRequestSchema) {}

function render(view: FeedbackView): contract.Feedback {
  return {
    ...view,
    answers: [...view.answers],
    submittedAt: view.submittedAt.toISOString(),
    settledAt: view.settledAt?.toISOString() ?? null,
  }
}

/**
 * Submitting a report and reading one. There is no update and no delete, which
 * is how FDBK-4 is enforced: the maker judges a fixed artifact, so nothing can
 * change it after the fact.
 */
@Controller()
export class FeedbacksController {
  constructor(
    private readonly submit: SubmitFeedbackUseCase,
    private readonly read: ReadFeedbackUseCase,
    private readonly settlement: SettleFeedbackUseCase,
  ) {}

  @Post('claims/:claimId/feedback')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Turn in the report for a slot you hold' })
  async create(
    @Param('claimId') claimId: string,
    @CurrentUser() actorId: string,
    @Body() body: SubmitFeedbackDto,
  ): Promise<contract.Feedback> {
    return render(
      unwrap(
        await this.submit.execute({
          claimId,
          actorId,
          report: {
            firstImpression: body.firstImpression,
            stuckAt: body.stuckAt,
            wouldPay: body.wouldPay,
            wouldPayReason: body.wouldPayReason,
            suggestion: body.suggestion,
            answers: body.answers,
          },
        }),
      ),
    )
  }

  /** Public (FDBK-9), rejected ones included, with the reason that was given. */
  @Get('feedbacks/:id')
  @Public()
  @ApiOperation({ summary: 'A submitted report' })
  async byId(@Param('id') id: string): Promise<contract.Feedback> {
    return render(unwrap(await this.read.byId(id)))
  }

  /**
   * FDBK-6. Both answers are 200 rather than POST's default 201: a decision
   * creates nothing, it finishes something.
   */
  @Post('feedbacks/:id/accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Accept a report and pay the feedbacker' })
  async accept(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
  ): Promise<contract.Feedback> {
    return render(unwrap(await this.settlement.accept({ feedbackId: id, actorId })))
  }

  @Post('feedbacks/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Reject a report with a reason the feedbacker can read' })
  async reject(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
    @Body() body: RejectFeedbackDto,
  ): Promise<contract.Feedback> {
    return render(
      unwrap(
        await this.settlement.reject({
          feedbackId: id,
          actorId,
          reason: body.reason,
          note: body.note ?? null,
        }),
      ),
    )
  }

  @Get('missions/:missionId/feedbacks')
  @Public()
  @ApiOperation({ summary: 'Every report turned in against a mission' })
  async forMission(@Param('missionId') missionId: string): Promise<contract.Feedback[]> {
    return (await this.read.forMission(missionId)).map(render)
  }
}
