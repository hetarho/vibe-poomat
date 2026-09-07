import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import {
  DOMAIN_EVENT_COLLECTOR,
  EVENT_BUS,
  type EventBus,
  TRANSACTION_MANAGER,
} from '../application'
import { ConfigModule } from '../config/config.module'
import { ENV, type Env } from '../config/env.token'
import { ReadinessRegistry } from '../health/readiness-registry'
import { createPool } from './create-pool'
import { DB, type Db, PG_POOL } from './db.token'
import { setPooledDb } from './db-context'
import { DbReadinessIndicator } from './db-readiness.indicator'
import { DrizzleTransactionManager } from './drizzle-transaction-manager'
import { ScopedDomainEventCollector } from './scoped-event-collector'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ENV],
      useFactory: (config: Env) => createPool(config),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool),
    },
    {
      provide: TRANSACTION_MANAGER,
      inject: [DB, EVENT_BUS],
      useFactory: (db: Db, eventBus: EventBus) => new DrizzleTransactionManager(db, eventBus),
    },
    { provide: DOMAIN_EVENT_COLLECTOR, useClass: ScopedDomainEventCollector },
  ],
  exports: [DB, PG_POOL, TRANSACTION_MANAGER, DOMAIN_EVENT_COLLECTOR],
})
export class DbModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DB) private readonly db: Db,
    private readonly readiness: ReadinessRegistry,
  ) {}

  onModuleInit(): void {
    // lets `getDb()` stay a plain function that any repository can call
    setPooledDb(this.db)
    this.readiness.register(new DbReadinessIndicator(this.pool))
  }

  async onApplicationShutdown(): Promise<void> {
    setPooledDb(undefined)
    await this.pool.end()
  }
}
