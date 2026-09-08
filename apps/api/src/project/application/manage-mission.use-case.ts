import type { CreditOperations, JobScheduler, TransactionManager } from '../../shared/application'
import { NO_OCCUPANCY, type SlotOccupancyReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ForbiddenError, ok, type Result } from '../../shared/result'
import { Mission } from '../domain/mission'
import {
  MissionAlreadyOpenError,
  MissionNotFoundError,
  MissionNotOpenError,
  QuestionsNotAllowedError,
  SlotsNotAllowedError,
  TaskTextNotAllowedError,
} from '../domain/mission-errors'
import { type MissionRepository, refundableSlots } from '../domain/mission-store.repository'
import { MissionQuestions, Slots, TaskText } from '../domain/mission-values'
import type { ProjectRepository } from '../domain/project.repository'
import { ProjectNotFoundError } from '../domain/project-errors'
import { type MissionView, toMissionView } from './mission-view'

/** The job that ends a mission nobody ended (PROJ-6). */
export const MISSION_EXPIRE_JOB = 'mission.expire'

export type MissionExpirePayload = { missionId: string }

/** Groups a mission's timers so rescheduling replaces rather than adds (ARCH-35). */
export function missionJobKey(missionId: string): string {
  return `mission:${missionId}`
}

export type ManageMissionError =
  | TaskTextNotAllowedError
  | QuestionsNotAllowedError
  | SlotsNotAllowedError
  | MissionAlreadyOpenError
  | MissionNotFoundError
  | MissionNotOpenError
  | ProjectNotFoundError
  | ForbiddenError
  | DomainError

export type OpenMissionCommand = {
  projectId: string
  actorId: string
  taskText: string
  questions?: readonly string[]
  slots: number
}

/**
 * Opening, closing and expiring a mission. All three move credits (CRED-3,
 * CRED-5) and all three do it inside the use case's own transaction, so a
 * mission row and the escrow behind it can never disagree (ARCH-38).
 */
export class ManageMissionUseCase {
  constructor(
    private readonly missions: MissionRepository,
    private readonly projects: ProjectRepository,
    private readonly occupancy: SlotOccupancyReader,
    private readonly credits: CreditOperations,
    private readonly jobs: JobScheduler,
    private readonly transactions: TransactionManager,
  ) {}

  async open(command: OpenMissionCommand): Promise<Result<MissionView, ManageMissionError>> {
    const taskText = TaskText.create(command.taskText)
    if (taskText.isErr()) return err(taskText.error)

    const questions = MissionQuestions.create(command.questions ?? [])
    if (questions.isErr()) return err(questions.error)

    const slots = Slots.create(command.slots)
    if (slots.isErr()) return err(slots.error)

    const projectId = EntityId.parse(command.projectId)
    if (projectId.isErr()) return err(new ProjectNotFoundError('no such project'))

    const project = await this.projects.findById(projectId.value)
    if (project === null || project.isDeleted()) {
      return err(new ProjectNotFoundError('no such project'))
    }

    const actorId = EntityId.parse(command.actorId)
    if (actorId.isErr() || !project.isOwnedBy(actorId.value)) {
      return err(new ForbiddenError('this project belongs to someone else'))
    }

    return this.transactions.run(async () => {
      // PROJ-5. The partial unique index is the real guard; this exists so the
      // caller gets an answer it can act on instead of a constraint violation
      if ((await this.missions.findOpenFor(projectId.value)) !== null) {
        return err(new MissionAlreadyOpenError('this project already has an open mission'))
      }

      const mission = Mission.open({
        projectId: projectId.value,
        taskText: taskText.value,
        questions: questions.value,
        slots: slots.value,
      })

      // CRED-3, in the same transaction: a mission whose escrow failed must not
      // exist, and an escrow whose mission failed must not hold anything
      const escrowed = await this.credits.escrowForMission({
        accountId: project.ownerId.value,
        missionId: mission.id.value,
        credits: slots.value.count,
      })
      if (escrowed.isErr()) return err(escrowed.error)

      await this.missions.save(mission)

      // enqueued inside the transaction, so a rollback leaves no timer behind
      await this.jobs.schedule(
        MISSION_EXPIRE_JOB,
        { missionId: mission.id.value } satisfies MissionExpirePayload,
        mission.expiresAt,
        { singletonKey: missionJobKey(mission.id.value) },
      )

      // a mission that has just opened has no claims against it yet
      return ok(toMissionView(mission, NO_OCCUPANCY))
    })
  }

  /** PROJ-6: the maker ends it early; whatever nobody took comes back. */
  async close(input: {
    missionId: string
    actorId: string
  }): Promise<Result<MissionView, ManageMissionError>> {
    const loaded = await this.load(input.missionId)
    if (loaded.isErr()) return err(loaded.error)
    const mission = loaded.value

    const project = await this.projects.findById(mission.projectId)
    if (project === null) return err(new ProjectNotFoundError('no such project'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr() || !project.isOwnedBy(actorId.value)) {
      return err(new ForbiddenError('this mission belongs to someone else'))
    }

    return this.end(mission, project.ownerId, 'closed')
  }

  /**
   * The expiry job's body (PROJ-6). Idempotent: a mission that already ended
   * refuses the transition, which is exactly what a redelivered job needs.
   */
  async expire(missionId: string): Promise<Result<void, ManageMissionError>> {
    const loaded = await this.load(missionId)
    if (loaded.isErr()) return err(loaded.error)
    const mission = loaded.value
    if (!mission.isOpen()) return ok(undefined)

    const project = await this.projects.findById(mission.projectId)
    if (project === null) return err(new ProjectNotFoundError('no such project'))

    const ended = await this.end(mission, project.ownerId, 'expired')
    if (ended.isErr()) return err(ended.error)

    return ok(undefined)
  }

  /**
   * PROJ-6: the last slot settled, so there is nothing to refund and nothing to
   * wait for. Called by the settlement handler, never by a poll.
   */
  async completeIfSettled(missionId: string): Promise<Result<void, ManageMissionError>> {
    const loaded = await this.load(missionId)
    if (loaded.isErr()) return err(loaded.error)
    const mission = loaded.value
    if (!mission.isOpen()) return ok(undefined)

    const occupancy = await this.occupancy.occupancyFor(mission.id.value)
    if (occupancy.settled < mission.slots.count) return ok(undefined)

    return this.transactions.run(async () => {
      const completed = mission.complete()
      if (completed.isErr()) return ok(undefined)

      await this.missions.save(mission)
      await this.jobs.cancel(MISSION_EXPIRE_JOB, missionJobKey(mission.id.value))

      return ok(undefined)
    })
  }

  private async end(
    mission: Mission,
    ownerId: EntityId,
    how: 'closed' | 'expired',
  ): Promise<Result<MissionView, ManageMissionError>> {
    return this.transactions.run(async () => {
      // computed at end time from the claim rows, never cached on the mission:
      // a slot that was held and released is refundable again (PROJ-6)
      const occupancy = await this.occupancy.occupancyFor(mission.id.value)
      const refunded = refundableSlots(mission.slots.count, occupancy)

      const ended = how === 'closed' ? mission.close(refunded) : mission.expire(refunded)
      if (ended.isErr()) return err(ended.error)

      if (refunded > 0) {
        const refundedCredits = await this.credits.refundUnfilled({
          makerId: ownerId.value,
          missionId: mission.id.value,
          credits: refunded,
        })
        if (refundedCredits.isErr()) return err(refundedCredits.error)
      }

      await this.missions.save(mission)
      // nothing left for the timer to do, whichever way this ended
      await this.jobs.cancel(MISSION_EXPIRE_JOB, missionJobKey(mission.id.value))

      return ok(toMissionView(mission, occupancy))
    })
  }

  private async load(missionId: string): Promise<Result<Mission, ManageMissionError>> {
    const id = EntityId.parse(missionId)
    if (id.isErr()) return err(new MissionNotFoundError('no such mission'))

    const mission = await this.missions.findById(id.value)
    if (mission === null) return err(new MissionNotFoundError('no such mission'))

    return ok(mission)
  }
}
