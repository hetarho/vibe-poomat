import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import type { JobHandler } from '../../shared/application'
import { JobRegistry } from '../../shared/infrastructure/jobs/job-registry'
import { SESSION_REPOSITORY, type SessionRepository } from '../domain/session.repository'

export const SESSION_CLEANUP_JOB = 'session.cleanup'

/** Hourly, on the hour. A lapsed row is already refused, so this is only space. */
export const SESSION_CLEANUP_CRON = '0 * * * *'

/**
 * Reclaims sessions past their expiry (AUTH-8). Idempotent by nature: deleting
 * rows that are already gone deletes nothing, which is what pg-boss's
 * at-least-once delivery needs.
 */
@Injectable()
export class SessionCleanupJob implements JobHandler, OnModuleInit {
  readonly jobName = SESSION_CLEANUP_JOB
  readonly cron = SESSION_CLEANUP_CRON
  private readonly logger = new Logger(SessionCleanupJob.name)

  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    private readonly registry: JobRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async handle(): Promise<void> {
    const removed = await this.sessions.deleteExpired(new Date())
    if (removed > 0) this.logger.log(`removed ${removed} expired session(s)`)
  }
}
