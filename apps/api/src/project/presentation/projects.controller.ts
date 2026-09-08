import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { projects } from '@repo/contracts'
import type { FastifyRequest } from 'fastify'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, type RequestWithUser, unwrap } from '../../shared/presentation'
import { GetProjectUseCase } from '../application/get-project.use-case'
import { ManageProjectUseCase } from '../application/manage-project.use-case'
import type { ProjectView } from '../application/project-view'

class CreateProjectDto extends createZodDto(projects.createProjectRequestSchema) {}
class UpdateProjectDto extends createZodDto(projects.updateProjectRequestSchema) {}

/** The one place a view becomes a response, so every route renders it alike. */
function render(view: ProjectView): projects.Project {
  return {
    ...view,
    tags: [...view.tags],
    activeMission:
      view.activeMission === null
        ? null
        : { ...view.activeMission, expiresAt: view.activeMission.expiresAt.toISOString() },
    deletedAt: view.deletedAt?.toISOString() ?? null,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  }
}

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly manage: ManageProjectUseCase,
    private readonly get: GetProjectUseCase,
  ) {}

  /**
   * Public, and the signed-in reader matters only for one thing: an owner keeps
   * seeing their own soft-deleted project (PROJ-8), so the guard is off and the
   * session, when there is one, is read straight off the request.
   */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'A project, with its owner and any open mission' })
  async byId(@Param('id') id: string, @Req() request: FastifyRequest): Promise<projects.Project> {
    const viewerId = (request as RequestWithUser).user?.id ?? null

    return render(unwrap(await this.get.execute({ projectId: id, viewerId })))
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Post a project, once its live url answers' })
  async create(
    @CurrentUser() ownerId: string,
    @Body() body: CreateProjectDto,
  ): Promise<projects.Project> {
    return render(
      unwrap(
        await this.manage.create({
          ownerId,
          title: body.title,
          liveUrl: body.liveUrl,
          pitch: body.pitch,
          description: body.description ?? undefined,
          tags: body.tags,
          coverKey: body.coverKey ?? undefined,
        }),
      ),
    )
  }

  @Patch(':id')
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Edit your own project' })
  async update(
    @Param('id') id: string,
    @CurrentUser() actorId: string,
    @Body() body: UpdateProjectDto,
  ): Promise<projects.Project> {
    return render(unwrap(await this.manage.update({ projectId: id, actorId, ...body })))
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Hide your own project, once no mission is open' })
  async remove(@Param('id') id: string, @CurrentUser() actorId: string): Promise<void> {
    unwrap(await this.manage.delete({ projectId: id, actorId }))
  }
}
