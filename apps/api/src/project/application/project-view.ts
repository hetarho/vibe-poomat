import type { FileStorage, UserSummary } from '../../shared/application'
import type { ActiveMissionSummary } from '../domain/mission.repository'
import type { Project } from '../domain/project'
import type { ProjectTag } from '../domain/project-values'

export type ProjectView = {
  id: string
  owner: UserSummary
  title: string
  liveUrl: string
  pitch: string
  description: string | null
  coverUrl: string | null
  tags: readonly ProjectTag[]
  upvoteCount: number
  activeMission: ActiveMissionSummary | null
  /** Non-null only for the owner, who keeps reading their archive (PROJ-8). */
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** An owner that has gone (AUTH-9) still leaves the project readable. */
export const DELETED_USER: UserSummary = {
  id: '',
  handle: 'deleted',
  displayName: 'deleted user',
  avatarUrl: null,
}

/**
 * One place turns a `Project` into what an endpoint returns, so every route
 * renders it alike. The cover is resolved here because only this layer holds the
 * storage port, and `deletedAt` is passed through rather than hidden — the
 * caller that is allowed to see a deleted project is allowed to see that it is.
 */
export function toProjectView(input: {
  project: Project
  owner: UserSummary | null
  storage: FileStorage
  activeMission?: ActiveMissionSummary | null
}): ProjectView {
  const { project } = input

  return {
    id: project.id.value,
    owner: input.owner ?? { ...DELETED_USER, id: project.ownerId.value },
    title: project.title.value,
    liveUrl: project.liveUrl.value,
    pitch: project.pitch.value,
    description: project.description?.value ?? null,
    coverUrl: project.cover === null ? null : input.storage.publicUrl(project.cover.key),
    tags: project.tags.values,
    upvoteCount: project.upvoteCount,
    activeMission: input.activeMission ?? null,
    deletedAt: project.deletedAt,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  }
}
