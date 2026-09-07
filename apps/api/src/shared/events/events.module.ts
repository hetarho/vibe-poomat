import { Global, Module } from '@nestjs/common'
import { EVENT_BUS } from '../application'
import { DomainEventRegistry } from './domain-event-registry'
import { InProcessEventBus } from './in-process-event-bus'

@Global()
@Module({
  providers: [
    DomainEventRegistry,
    InProcessEventBus,
    { provide: EVENT_BUS, useExisting: InProcessEventBus },
  ],
  exports: [DomainEventRegistry, EVENT_BUS],
})
export class EventsModule {}
