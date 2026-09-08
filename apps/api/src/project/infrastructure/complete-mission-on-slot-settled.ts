import { Injectable, type OnModuleInit } from '@nestjs/common'
import type { DomainEventHandler } from '../../shared/application'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import { CROSS_CONTEXT_EVENTS, carriesMissionId, type DomainEvent } from '../../shared/kernel'
import { ManageMissionUseCase } from '../application/manage-mission.use-case'

/**
 * PROJ-6: a mission whose last slot settles is completed. Driven by the
 * settlement itself rather than by a poll, and after the transaction that
 * settled it has committed (ARCH-39), so the count this reads is the real one.
 *
 * The event comes from the feedback context, so only the published part of it is
 * read: the mission it belongs to.
 */
@Injectable()
export class CompleteMissionOnSlotSettled implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.slotSettled

  constructor(
    private readonly missions: ManageMissionUseCase,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    if (!carriesMissionId(event)) return

    await this.missions.completeIfSettled(event.missionId)
  }
}
