import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { JobHandler } from '../../shared/application'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import {
  ManageMissionUseCase,
  MISSION_EXPIRE_JOB,
  type MissionExpirePayload,
} from '../application/manage-mission.use-case'

/**
 * PROJ-6: thirty days after it opened, a mission nobody ended stops taking
 * feedback and hands back whatever nobody took. Scheduled at open time for an
 * absolute instant, so a restart cannot lose or shift it.
 *
 * Idempotent, because pg-boss delivers at least once: a mission that has already
 * ended refuses the transition and the handler simply returns.
 */
@Injectable()
export class ExpireMissionJob implements JobHandler<MissionExpirePayload>, OnModuleInit {
  readonly jobName = MISSION_EXPIRE_JOB
  private readonly logger = new Logger(ExpireMissionJob.name)

  constructor(
    private readonly missions: ManageMissionUseCase,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: MissionExpirePayload): Promise<void> {
    const expired = await this.missions.expire(data.missionId)
    if (expired.isErr()) {
      // a mission that has gone is not a failure worth retrying; anything else is
      if (expired.error.code === 'MISSION_NOT_FOUND') return

      throw new Error(`could not expire ${data.missionId}: ${expired.error.message}`)
    }
  }
}
