import type { EntityId } from '../../shared/kernel'
import type { Project } from './project'

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY')

export type ProjectRepository = {
  /** Returns soft-deleted rows too; only the caller knows whether it may see one. */
  findById(id: EntityId): Promise<Project | null>
  /** Live ones only: AUTH-9 has nothing left to do to a project already gone. */
  listLiveByOwner(ownerId: EntityId): Promise<Project[]>
  save(project: Project): Promise<void>
}
