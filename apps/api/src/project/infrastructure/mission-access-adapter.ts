import { Inject, Injectable } from '@nestjs/common'
import type { MissionForClaim, MissionReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { MISSION_REPOSITORY, type MissionRepository } from '../domain/mission-store.repository'
import { PROJECT_REPOSITORY, type ProjectRepository } from '../domain/project.repository'

/**
 * What the feedback context is allowed to know about a mission: whether it is
 * taking feedback, how many slots it has, and who may not claim one (FDBK-2).
 * Nothing here lets a caller change anything.
 */
@Injectable()
export class MissionAccessAdapter implements MissionReader {
  constructor(
    @Inject(MISSION_REPOSITORY) private readonly missions: MissionRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
  ) {}

  async forClaim(missionId: string): Promise<MissionForClaim | null> {
    const id = EntityId.parse(missionId)
    if (id.isErr()) return null

    const mission = await this.missions.findById(id.value)
    if (mission === null) return null

    const project = await this.projects.findById(mission.projectId)
    if (project === null) return null

    return {
      id: mission.id.value,
      projectId: mission.projectId.value,
      ownerId: project.ownerId.value,
      slots: mission.slots.count,
      // a hidden project is not taking feedback either, whatever the mission says
      isOpen: mission.isOpen() && !project.isDeleted(),
    }
  }
}
