import type {
  FileStorage,
  HttpProbe,
  TransactionManager,
  UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ForbiddenError, ok, type Result } from '../../shared/result'
import type { ActiveMissionReader } from '../domain/mission.repository'
import { Project } from '../domain/project'
import type { ProjectRepository } from '../domain/project.repository'
import {
  ProjectLockedByMissionError,
  ProjectNotFoundError,
  ProjectUrlUnreachableError,
} from '../domain/project-errors'
import {
  type ProjectFieldError,
  parseLiveUrl,
  parseNewProjectFields,
  parseProjectFields,
} from './project-fields'
import { type ProjectView, toProjectView } from './project-view'

export type ManageProjectError =
  | ProjectFieldError
  | ProjectNotFoundError
  | ProjectUrlUnreachableError
  | ProjectLockedByMissionError
  | ForbiddenError

export type CreateProjectCommand = {
  ownerId: string
  title: string
  liveUrl: string
  pitch: string
  description?: string | null
  tags: readonly string[]
  coverKey?: string | null
}

export type UpdateProjectCommand = {
  projectId: string
  actorId: string
  title?: string
  liveUrl?: string
  pitch?: string
  description?: string | null
  tags?: readonly string[]
  coverKey?: string | null
}

/**
 * Everything an owner can do to their own project. Create, update and delete
 * share a context and a set of rules — who may act (single owner, PROJ-12), what
 * a mission freezes (PROJ-7, PROJ-8) — so they share a class rather than
 * repeating those rules in three.
 */
export class ManageProjectUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly missions: ActiveMissionReader,
    private readonly probe: HttpProbe,
    private readonly users: UserSummaryReader,
    private readonly storage: FileStorage,
    private readonly transactions: TransactionManager,
  ) {}

  /** PROJ-2: the URL is checked before the row exists, so an unusable one never does. */
  async create(command: CreateProjectCommand): Promise<Result<ProjectView, ManageProjectError>> {
    const ownerId = EntityId.parse(command.ownerId)
    if (ownerId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const fields = parseNewProjectFields(command)
    if (fields.isErr()) return err(fields.error)

    const liveUrl = parseLiveUrl(command.liveUrl)
    if (liveUrl.isErr()) return err(liveUrl.error)

    const reachable = await this.verify(liveUrl.value.value)
    if (reachable.isErr()) return err(reachable.error)

    return this.transactions.run(async () => {
      const project = Project.create({
        ownerId: ownerId.value,
        liveUrl: liveUrl.value,
        ...fields.value,
      })
      await this.projects.save(project)

      return ok(await this.view(project))
    })
  }

  async update(command: UpdateProjectCommand): Promise<Result<ProjectView, ManageProjectError>> {
    const fields = parseProjectFields(command)
    if (fields.isErr()) return err(fields.error)

    const liveUrl = command.liveUrl === undefined ? undefined : parseLiveUrl(command.liveUrl)
    if (liveUrl?.isErr() === true) return err(liveUrl.error)

    const loaded = await this.loadOwned(command.projectId, command.actorId)
    if (loaded.isErr()) return err(loaded.error)
    const project = loaded.value

    if (liveUrl !== undefined && liveUrl.isOk() && !liveUrl.value.equals(project.liveUrl)) {
      // PROJ-7: feedback has to match what the feedbackers were sent to look at
      if ((await this.missions.activeFor(project.id.value)) !== null) {
        return err(
          new ProjectLockedByMissionError('the live url cannot change while a mission is open'),
        )
      }

      const reachable = await this.verify(liveUrl.value.value)
      if (reachable.isErr()) return err(reachable.error)
    }

    return this.transactions.run(async () => {
      project.update(fields.value)
      if (liveUrl !== undefined && liveUrl.isOk()) project.changeLiveUrl(liveUrl.value)
      await this.projects.save(project)

      return ok(await this.view(project))
    })
  }

  /** PROJ-8: hidden rather than removed, and only once nobody is working on it. */
  async delete(input: {
    projectId: string
    actorId: string
  }): Promise<Result<void, ManageProjectError>> {
    const loaded = await this.loadOwned(input.projectId, input.actorId)
    if (loaded.isErr()) return err(loaded.error)
    const project = loaded.value

    if ((await this.missions.activeFor(project.id.value)) !== null) {
      return err(new ProjectLockedByMissionError('a mission is open on this project'))
    }

    return this.transactions.run(async () => {
      project.softDelete()
      await this.projects.save(project)

      return ok(undefined)
    })
  }

  private async loadOwned(
    projectId: string,
    actorId: string,
  ): Promise<Result<Project, ManageProjectError>> {
    const id = EntityId.parse(projectId)
    if (id.isErr()) return err(new ProjectNotFoundError('no such project'))

    const project = await this.projects.findById(id.value)
    if (project === null) return err(new ProjectNotFoundError('no such project'))

    const actor = EntityId.parse(actorId)
    // a stranger is told the same thing whether or not the project is theirs to
    // find; an owner's own project answers normally
    if (actor.isErr() || !project.isOwnedBy(actor.value)) {
      return err(new ForbiddenError('this project belongs to someone else'))
    }

    return ok(project)
  }

  private async verify(url: string): Promise<Result<void, ProjectUrlUnreachableError>> {
    const probed = await this.probe.probe(url)
    if (probed.isErr()) {
      return err(
        new ProjectUrlUnreachableError('this url could not be opened', {
          url,
          reason: probed.error.message,
          ...(typeof probed.error.details === 'object' && probed.error.details !== null
            ? probed.error.details
            : {}),
        }),
      )
    }

    return ok(undefined)
  }

  private async view(project: Project): Promise<ProjectView> {
    const [owner, activeMission] = await Promise.all([
      this.users.summaryFor(project.ownerId.value),
      this.missions.activeFor(project.id.value),
    ])

    return toProjectView({ project, owner, storage: this.storage, activeMission })
  }
}
