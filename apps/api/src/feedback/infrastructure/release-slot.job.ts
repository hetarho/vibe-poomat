import { Injectable, type OnModuleInit } from '@nestjs/common'
import type { JobHandler } from '../../shared/application'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import {
  ClaimSlotUseCase,
  SLOT_RELEASE_JOB,
  type SlotReleasePayload,
} from '../application/claim-slot.use-case'

/**
 * FDBK-1: a slot held for a day with nothing submitted goes back, so the next
 * person can take it. Scheduled at the hold's absolute end, cancelled when the
 * holder releases or submits, and idempotent because pg-boss delivers at least
 * once — a claim that is no longer held is left alone.
 */
@Injectable()
export class ReleaseSlotJob implements JobHandler<SlotReleasePayload>, OnModuleInit {
  readonly jobName = SLOT_RELEASE_JOB

  constructor(
    private readonly claims: ClaimSlotUseCase,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(data: SlotReleasePayload): Promise<void> {
    const released = await this.claims.releaseIfLapsed(data.claimId)
    if (released.isErr()) {
      // a claim that has gone is not a failure worth retrying; anything else is
      if (released.error.code === 'CLAIM_NOT_FOUND') return

      throw new Error(`could not release ${data.claimId}: ${released.error.message}`)
    }
  }
}
