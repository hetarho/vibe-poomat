import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common'
import PgBoss from 'pg-boss'
import { PermanentJobFailure } from '../../application'
import { ENV, type Env } from '../../config/env.token'
import { ReadinessRegistry } from '../../health/readiness-registry'
import { deadLetterQueueFor, queueOptionsFor } from './job-policy'
import { JobRegistry } from './job-registry'

export const PGBOSS_SCHEMA = 'pgboss'

/**
 * Owns the pg-boss singleton. Starts on `onApplicationBootstrap` rather than
 * `onModuleInit`, because that is the first point where every context has had a
 * chance to register its handlers.
 */
@Injectable()
export class PgBossService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PgBossService.name)
  private readonly boss: PgBoss
  private started = false

  constructor(
    @Inject(ENV) private readonly config: Env,
    private readonly registry: JobRegistry,
    private readonly readiness: ReadinessRegistry,
  ) {
    // pg-boss owns this schema and creates it itself; drizzle-kit never sees it
    this.boss = new PgBoss({ connectionString: config.DATABASE_URL, schema: PGBOSS_SCHEMA })
  }

  instance(): PgBoss {
    return this.boss
  }

  async onApplicationBootstrap(): Promise<void> {
    this.boss.on('error', (error) => {
      this.logger.error('pg-boss failed', error.stack)
    })

    await this.boss.start()
    this.started = true

    for (const name of this.registry.names()) {
      await this.boss.createQueue(deadLetterQueueFor(name))
      await this.boss.createQueue(
        name,
        queueOptionsFor(name, this.registry.require(name).retryPolicy),
      )
    }

    await this.registerSchedules()

    if (this.config.JOBS_ENABLED) await this.attachWorkers()
    else this.logger.warn('JOBS_ENABLED is off: this instance schedules jobs but runs none')

    this.readiness.register({
      name: 'jobs',
      check: async () => this.started,
    })
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.started) return
    this.started = false
    await this.boss.stop({ graceful: true })
  }

  /**
   * Recurring jobs, declared by the handler that owns them. pg-boss keys a
   * schedule by queue name, so re-registering the same one at every boot updates
   * it rather than adding a second — which is what makes this safe to run on
   * every instance.
   */
  private async registerSchedules(): Promise<void> {
    for (const name of this.registry.names()) {
      const { cron } = this.registry.require(name)
      if (cron === undefined) continue

      await this.boss.schedule(name, cron)
      this.logger.log(`scheduled ${name} at ${cron}`)
    }
  }

  private async attachWorkers(): Promise<void> {
    for (const name of this.registry.names()) {
      const handler = this.registry.require(name)
      await this.boss.work<object>(name, async (jobs) => {
        for (const job of jobs) await this.runOne(name, job.data, handler.handle.bind(handler))
      })
    }
    this.logger.log(`workers attached: ${this.registry.names().join(', ') || 'none'}`)
  }

  /**
   * A thrown error retries, which is what pg-boss does anyway. A
   * PermanentJobFailure instead goes straight to the dead-letter queue, because
   * repeating that work can only fail the same way.
   */
  private async runOne(
    name: string,
    data: object,
    handle: (data: object) => Promise<void>,
  ): Promise<void> {
    try {
      await handle(data)
    } catch (error) {
      if (!(error instanceof PermanentJobFailure)) throw error

      this.logger.error(`${name} failed permanently: ${error.message}`)
      await this.boss.send(deadLetterQueueFor(name), { data, reason: error.message })
    }
  }
}
