import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common'
import { ApiOperation, ApiQuery } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { projects } from '@repo/contracts'
import type { FastifyRequest } from 'fastify'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, type RequestWithUser, unwrap } from '../../shared/presentation'
import type { FeedCard } from '../application/get-feed.use-case'
import { GetFeedUseCase } from '../application/get-feed.use-case'
import { ToggleUpvoteUseCase } from '../application/toggle-upvote.use-case'
import { FEED_SORTS } from '../domain/feed.query'

function render(card: FeedCard): projects.FeedCard {
  return { ...card, tags: [...card.tags], createdAt: card.createdAt.toISOString() }
}

/**
 * The feed (PROJ-9) and its showcase tab (PROJ-10). Public, but the signed-in
 * reader matters: whether their own upvote stands decides how the button renders.
 */
@Controller('projects')
export class FeedController {
  constructor(
    private readonly feed: GetFeedUseCase,
    private readonly upvote: ToggleUpvoteUseCase,
  ) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'The feed: open missions first, or the popular tab' })
  @ApiQuery({ name: 'sort', required: false, enum: FEED_SORTS })
  @ApiQuery({ name: 'tag', required: false })
  @ApiQuery({ name: 'owner', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('sort') sort: string | undefined,
    @Query('tag') tag: string | undefined,
    @Query('owner') owner: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<projects.FeedPage> {
    const page = unwrap(
      await this.feed.execute({
        sort: sort === 'popular' ? 'popular' : 'default',
        tag,
        owner,
        cursor,
        limit: limit === undefined ? undefined : Number(limit),
        viewerId: (request as RequestWithUser).user?.id ?? null,
      }),
    )

    return { items: page.items.map(render), nextCursor: page.nextCursor }
  }

  @Post(':id/upvote')
  // 200, not POST's default 201: a toggle creates nothing the caller can address
  @HttpCode(HttpStatus.OK)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Upvote a project, or take your upvote back' })
  async toggle(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
  ): Promise<projects.UpvoteResult> {
    return unwrap(await this.upvote.execute({ projectId: id, actorId }))
  }
}
