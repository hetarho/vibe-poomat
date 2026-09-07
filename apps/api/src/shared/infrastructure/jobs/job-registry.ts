import { Injectable } from '@nestjs/common'
import type { JobHandler } from '../../application'

export const DUPLICATE_JOB_HANDLER = 'two handlers claim the same job name'
export const UNKNOWN_JOB_NAME = 'no handler is registered for the job name'

/**
 * One handler per job name, registered by the owning context in `onModuleInit`.
 * An unknown name is rejected when a job is scheduled, not when it runs.
 */
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<string, JobHandler>()

  register(handler: JobHandler): void {
    if (this.handlers.has(handler.jobName)) {
      throw new Error(`${DUPLICATE_JOB_HANDLER}: ${handler.jobName}`)
    }
    this.handlers.set(handler.jobName, handler)
  }

  names(): readonly string[] {
    return [...this.handlers.keys()]
  }

  has(jobName: string): boolean {
    return this.handlers.has(jobName)
  }

  require(jobName: string): JobHandler {
    const handler = this.handlers.get(jobName)
    if (handler === undefined) throw new Error(`${UNKNOWN_JOB_NAME}: ${jobName}`)

    return handler
  }
}
