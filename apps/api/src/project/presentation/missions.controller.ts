import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { ApiOperation } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import { projects } from '@repo/contracts'
import { createZodDto } from 'nestjs-zod'
import { WRITE_THROTTLER } from '../../shared/infrastructure/throttling/throttler-policy'
import { CurrentUser, Public, unwrap } from '../../shared/presentation'
import { GetMissionsUseCase } from '../application/get-missions.use-case'
import { ManageMissionUseCase } from '../application/manage-mission.use-case'
import type { MissionView } from '../application/mission-view'

class OpenMissionDto extends createZodDto(projects.openMissionRequestSchema) {}

function render(view: MissionView): projects.Mission {
  return {
    ...view,
    questions: [...view.questions],
    occupancy: { ...view.occupancy },
    openedAt: view.openedAt.toISOString(),
    expiresAt: view.expiresAt.toISOString(),
    endedAt: view.endedAt?.toISOString() ?? null,
  }
}

/**
 * Opening a mission is a thing done to a project, so it hangs off one. There is
 * no update counterpart on purpose: PROJ-7 freezes the task, the questions and
 * the slot count for the life of the mission.
 */
@Controller('projects/:projectId/missions')
export class ProjectMissionsController {
  constructor(
    private readonly missions: ManageMissionUseCase,
    private readonly read: GetMissionsUseCase,
  ) {}

  /**
   * PROJ-6's whole history, newest first. Public: the frozen task text and
   * questions are what a feedbacker is being asked to work from (PROJ-7).
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Every mission this project has run, newest first' })
  async list(@Param('projectId') projectId: string): Promise<projects.Mission[]> {
    return unwrap(await this.read.forProject(projectId)).map(render)
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'Open a mission, escrowing one credit per slot' })
  async open(
    @Param('projectId') projectId: string,
    @CurrentUser() actorId: string,
    @Body() body: OpenMissionDto,
  ): Promise<projects.Mission> {
    return render(
      unwrap(
        await this.missions.open({
          projectId,
          actorId,
          taskText: body.taskText,
          questions: body.questions,
          slots: body.slots,
        }),
      ),
    )
  }
}

@Controller('missions')
export class MissionsController {
  constructor(
    private readonly missions: ManageMissionUseCase,
    private readonly read: GetMissionsUseCase,
  ) {}

  /** Public: the report form is reached by mission id and needs the frozen task. */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'One mission, with its frozen task and its slots' })
  async byId(@Param('id') id: string): Promise<projects.Mission> {
    return render(unwrap(await this.read.byId(id)))
  }

  @Post(':id/close')
  // 200, not POST's default 201: closing creates nothing, it ends something
  @HttpCode(HttpStatus.OK)
  @Throttle({ [WRITE_THROTTLER]: {} })
  @ApiOperation({ summary: 'End your own mission and take back the unfilled slots' })
  async close(@Param('id') id: string, @CurrentUser() actorId: string): Promise<projects.Mission> {
    return render(unwrap(await this.missions.close({ missionId: id, actorId })))
  }
}
