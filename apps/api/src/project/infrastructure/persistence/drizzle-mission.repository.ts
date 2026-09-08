import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq } from 'drizzle-orm'
import { DOMAIN_EVENT_COLLECTOR, type DomainEventCollector } from '../../../shared/application'
import { getDb, isUniqueViolation } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import type { DomainError, Result } from '../../../shared/result'
import { Mission, type MissionState } from '../../domain/mission'
import { MissionAlreadyOpenError } from '../../domain/mission-errors'
import type { MissionRepository } from '../../domain/mission-store.repository'
import { MissionQuestions, Slots, TaskText } from '../../domain/mission-values'
import { missions } from './schema'

/** Name drizzle-kit gives the partial unique index behind PROJ-5. */
const ONE_OPEN_PER_PROJECT = 'missions_one_open_per_project_unq'

function must<T>(result: Result<T, DomainError>, what: string): T {
  if (result.isErr()) throw new Error(`stored ${what} is not valid: ${result.error.message}`)

  return result.value
}

type Row = typeof missions.$inferSelect

function toMission(row: Row): Mission {
  return Mission.restore(must(EntityId.parse(row.id), 'mission id'), {
    projectId: must(EntityId.parse(row.projectId), 'project id'),
    taskText: must(TaskText.create(row.taskText), 'task text'),
    questions: must(MissionQuestions.create(row.questions), 'questions'),
    slots: must(Slots.create(row.slots), 'slots'),
    state: row.state as MissionState,
    openedAt: row.openedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

@Injectable()
export class DrizzleMissionRepository implements MissionRepository {
  constructor(@Inject(DOMAIN_EVENT_COLLECTOR) private readonly events: DomainEventCollector) {}

  async findById(id: EntityId): Promise<Mission | null> {
    const rows = await getDb().select().from(missions).where(eq(missions.id, id.value)).limit(1)
    const row = rows[0]

    return row === undefined ? null : toMission(row)
  }

  async findOpenFor(projectId: EntityId): Promise<Mission | null> {
    const rows = await getDb()
      .select()
      .from(missions)
      .where(and(eq(missions.projectId, projectId.value), eq(missions.state, 'open')))
      .limit(1)
    const row = rows[0]

    return row === undefined ? null : toMission(row)
  }

  /** Newest first, so the maker's panel reads the latest one at index zero. */
  async listForProject(projectId: EntityId): Promise<Mission[]> {
    const rows = await getDb()
      .select()
      .from(missions)
      .where(eq(missions.projectId, projectId.value))
      .orderBy(desc(missions.id))

    return rows.map(toMission)
  }

  /**
   * Nothing but `state` and `ended_at` ever moves, because PROJ-7 freezes the
   * rest for the life of the mission. A second open mission is refused by the
   * index rather than by anyone remembering to check.
   */
  async save(mission: Mission): Promise<void> {
    const row = {
      id: mission.id.value,
      projectId: mission.projectId.value,
      taskText: mission.taskText.value,
      questions: [...mission.questions.values],
      slots: mission.slots.count,
      state: mission.state,
      openedAt: mission.openedAt,
      endedAt: mission.endedAt,
      createdAt: mission.createdAt,
      updatedAt: mission.updatedAt,
    }

    try {
      await getDb()
        .insert(missions)
        .values(row)
        .onConflictDoUpdate({
          target: missions.id,
          set: { state: row.state, endedAt: row.endedAt, updatedAt: row.updatedAt },
        })
    } catch (error) {
      if (isUniqueViolation(error, ONE_OPEN_PER_PROJECT)) {
        throw new MissionAlreadyOpenError('this project already has an open mission')
      }
      throw error
    }

    // drained here rather than by the use case, so an aggregate's events cannot
    // be published without the write that produced them having landed (ARCH-39)
    this.events.collect(mission.pullEvents())
  }
}
