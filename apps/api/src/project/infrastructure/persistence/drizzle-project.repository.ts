import { Injectable } from '@nestjs/common'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import type { DomainError, Result } from '../../../shared/result'
import { Project } from '../../domain/project'
import type { ProjectRepository } from '../../domain/project.repository'
import { Cover, Description, LiveUrl, Pitch, Tags, Title } from '../../domain/project-values'
import { projects } from './schema'

/** A stored row that fails to parse is corruption, not an expected failure. */
function must<T>(result: Result<T, DomainError>, what: string): T {
  if (result.isErr()) throw new Error(`stored ${what} is not valid: ${result.error.message}`)

  return result.value
}

type Row = typeof projects.$inferSelect

function toProject(row: Row): Project {
  return Project.restore(must(EntityId.parse(row.id), 'project id'), {
    ownerId: must(EntityId.parse(row.ownerId), 'owner id'),
    title: must(Title.create(row.title), 'title'),
    liveUrl: must(LiveUrl.create(row.liveUrl), 'live url'),
    pitch: must(Pitch.create(row.pitch), 'pitch'),
    description:
      row.description === null ? null : must(Description.create(row.description), 'description'),
    cover: row.coverKey === null ? null : must(Cover.fromStorageKey(row.coverKey), 'cover'),
    tags: must(Tags.create(row.tags), 'tags'),
    upvoteCount: row.upvoteCount,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

@Injectable()
export class DrizzleProjectRepository implements ProjectRepository {
  async findById(id: EntityId): Promise<Project | null> {
    const rows = await getDb().select().from(projects).where(eq(projects.id, id.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toProject(row)
  }

  async listLiveByOwner(ownerId: EntityId): Promise<Project[]> {
    const rows = await getDb()
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, ownerId.value), isNull(projects.deletedAt)))
      .orderBy(asc(projects.id))

    return rows.map(toProject)
  }

  /**
   * Upsert on the primary key. `upvote_count` is deliberately absent from the
   * update: T024 maintains it beside the vote, and an aggregate that loaded a
   * stale count must not write it back over a newer one.
   */
  async save(project: Project): Promise<void> {
    const row = {
      id: project.id.value,
      ownerId: project.ownerId.value,
      title: project.title.value,
      liveUrl: project.liveUrl.value,
      pitch: project.pitch.value,
      description: project.description?.value ?? null,
      coverKey: project.cover?.key ?? null,
      tags: [...project.tags.values],
      upvoteCount: project.upvoteCount,
      deletedAt: project.deletedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }

    await getDb()
      .insert(projects)
      .values(row)
      .onConflictDoUpdate({
        target: projects.id,
        set: {
          title: row.title,
          liveUrl: row.liveUrl,
          pitch: row.pitch,
          description: row.description,
          coverKey: row.coverKey,
          tags: row.tags,
          deletedAt: row.deletedAt,
          updatedAt: row.updatedAt,
        },
      })
  }
}
