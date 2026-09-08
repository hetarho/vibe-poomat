import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { DomainEventHandler } from '../../shared/application'
import { DomainEventRegistry } from '../../shared/events/domain-event-registry'
import { CROSS_CONTEXT_EVENTS, type DomainEvent } from '../../shared/kernel'
// a value import, not `import type`: NestJS reads the runtime class from the
// emitted decorator metadata to resolve this dependency
import { CreditLedgerService } from '../application/credit-ledger.service'

/**
 * CRED-2 + AUTH-2: signing up for the first time is what creates credits, and it
 * is the only thing that does. The handler reads the aggregate id and nothing
 * else, so this context never has to know what an account looks like — only that
 * one now exists (ARCH-10).
 *
 * Idempotent through the ledger's `(type, account, ref)` key, which is what makes
 * a redelivered event a no-op rather than a second grant (ARCH-39).
 */
@Injectable()
export class GrantSeedOnAccountCreated implements DomainEventHandler, OnModuleInit {
  readonly eventName = CROSS_CONTEXT_EVENTS.accountCreated
  private readonly logger = new Logger(GrantSeedOnAccountCreated.name)

  constructor(
    private readonly credits: CreditLedgerService,
    private readonly registry: DomainEventRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(event: DomainEvent): Promise<void> {
    const granted = await this.credits.grantSeed(event.aggregateId.value)
    if (granted.isErr()) {
      // the grant is the account's whole starting position, so a failure has to
      // be loud: nothing else creates credits (CRED-1)
      this.logger.error(`could not seed ${event.aggregateId.value}: ${granted.error.message}`)
    }
  }
}
