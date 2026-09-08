import type { FileStorage, UserSummaryReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import type { ActiveMissionReader } from '../domain/mission.repository'
import type { ProjectRepository } from '../domain/project.repository'
import { ProjectNotFoundError } from '../domain/project-errors'
import { type ProjectView, toProjectView } from './project-view'

/**
 * The public read. A soft-deleted project is simply not there as far as anyone
 * but its owner is concerned (PROJ-8) — same 404 as one that never existed, so
 * the endpoint does not confirm that a deleted project ever did.
 */
export class GetProjectUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly missions: ActiveMissionReader,
    private readonly users: UserSummaryReader,
    private readonly storage: FileStorage,
  ) {}

  async execute(input: {
    projectId: string
    viewerId?: string | null
  }): Promise<Result<ProjectView, ProjectNotFoundError>> {
    const id = EntityId.parse(input.projectId)
    if (id.isErr()) return err(new ProjectNotFoundError('no such project'))

    const project = await this.projects.findById(id.value)
    if (project === null) return err(new ProjectNotFoundError('no such project'))

    if (project.isDeleted()) {
      const viewer =
        input.viewerId === undefined || input.viewerId === null
          ? null
          : EntityId.parse(input.viewerId)
      const isOwner = viewer !== null && viewer.isOk() && project.isOwnedBy(viewer.value)
      if (!isOwner) return err(new ProjectNotFoundError('no such project'))
    }

    const [owner, activeMission] = await Promise.all([
      this.users.summaryFor(project.ownerId.value),
      this.missions.activeFor(project.id.value),
    ])

    return ok(toProjectView({ project, owner, storage: this.storage, activeMission }))
  }
}
