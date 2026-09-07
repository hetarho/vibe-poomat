import {
  Global,
  Inject,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import { ConfigModule } from '../config/config.module'
import { ENV, type Env } from '../config/env.token'
import { ReadinessRegistry } from '../health/readiness-registry'
import { createPool } from './create-pool'
import { DB, PG_POOL } from './db.token'
import { DbReadinessIndicator } from './db-readiness.indicator'

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
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly readiness: ReadinessRegistry,
  ) {}

  onModuleInit(): void {
    this.readiness.register(new DbReadinessIndicator(this.pool))
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end()
  }
}
