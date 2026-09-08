import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { feedback as contract } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, unwrap } from '../../shared/presentation'
import type { FeedbackView } from '../application/feedback-view'
import { ReadFeedbackUseCase } from '../application/read-feedback.use-case'
import { SettleFeedbackUseCase } from '../application/settle-feedback.use-case'
import { SubmitFeedbackUseCase } from '../application/submit-feedback.use-case'
import type { ReplyView } from '../application/thread.use-case'
import { ThreadUseCase } from '../application/thread.use-case'

class SubmitFeedbackDto extends createZodDto(contract.submitFeedbackRequestSchema) {}
class RejectFeedbackDto extends createZodDto(contract.rejectFeedbackRequestSchema) {}
class PostReplyDto extends createZodDto(contract.postReplyRequestSchema) {}

function renderReply(view: ReplyView): contract.FeedbackReply {
  return { ...view, createdAt: view.createdAt.toISOString() }
}

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
    private readonly thread: ThreadUseCase,
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

  /**
   * FDBK-5: everyone reads, and only the two of them write. There is no window —
   * the conversation about a rejection is exactly the one worth having.
   */
  @Post('feedbacks/:id/replies')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Reply in the thread on a report' })
  async reply(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
    @Body() body: PostReplyDto,
  ): Promise<contract.FeedbackReply> {
    return renderReply(
      unwrap(await this.thread.reply({ feedbackId: id, actorId, body: body.body })),
    )
  }

  @Get('feedbacks/:id/replies')
  @Public()
  @ApiOperation({ summary: 'The thread on a report, oldest first' })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async replies(
    @Param('id') id: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ): Promise<contract.ThreadPage> {
    const page = unwrap(
      await this.thread.read({
        feedbackId: id,
        cursor,
        limit: limit === undefined ? undefined : Number(limit),
      }),
    )

    return { items: page.items.map(renderReply), nextCursor: page.nextCursor }
  }

  @Get('missions/:missionId/feedbacks')
  @Public()
  @ApiOperation({ summary: 'Every report turned in against a mission' })
  async forMission(@Param('missionId') missionId: string): Promise<contract.Feedback[]> {
    return (await this.read.forMission(missionId)).map(render)
  }
}
