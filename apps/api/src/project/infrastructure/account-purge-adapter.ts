import { Inject, Injectable } from '@nestjs/common'
import type { ProjectPurge } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ok, type Result } from '../../shared/result'
import { ManageMissionUseCase } from '../application/manage-mission.use-case'
import { MISSION_REPOSITORY, type MissionRepository } from '../domain/mission-store.repository'
import { PROJECT_REPOSITORY, type ProjectRepository } from '../domain/project.repository'

/**
 * What AUTH-9 may ask of the `project` context. It is deliberately two calls
 * rather than one: the missions have to end — refunding their unfilled slots —
 * before the feedback context settles what is still pending on them, and the
 * projects only go once that has happened.
 *
 * Everything here runs inside the caller's transaction (ARCH-38), so a failure
 * anywhere in the sequence takes the whole deletion with it.
 */
@Injectable()
export class ProjectAccountPurge implements ProjectPurge {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    private readonly missionUseCase: ManageMissionUseCase,
  ) {}

  async endMissionsOf(ownerId: string): Promise<Result<number, DomainError>> {
    const id = EntityId.parse(ownerId)
    if (id.isErr()) return err(id.error)

    let ended = 0
    for (const project of await this.projects.listLiveByOwner(id.value)) {
      const open = await this.missions.findOpenFor(project.id)
      if (open === null) continue

      // the ordinary close (PROJ-6), which is what refunds the slots nobody took
      const closed = await this.missionUseCase.close({
        missionId: open.id.value,
        actorId: ownerId,
      })
      if (closed.isErr()) return err(closed.error)

      ended += 1
    }

    return ok(ended)
  }

  /**
   * PROJ-8's hide, applied to every project at once. Soft rather than hard,
   * because FDBK-9 keeps the feedback these projects received public and that
   * feedback names the project it was written about.
   */
  async removeProjectsOf(ownerId: string): Promise<Result<void, DomainError>> {
    const id = EntityId.parse(ownerId)
    if (id.isErr()) return err(id.error)

    for (const project of await this.projects.listLiveByOwner(id.value)) {
      project.softDelete()
      await this.projects.save(project)
    }

    return ok(undefined)
  }
}
