export const JOB_SCHEDULER = Symbol('JOB_SCHEDULER')

export type JobOptions = {
  /**
   * Identifies what the job acts on, by convention the aggregate id
   * (`feedback:<id>`), so rescheduling a timer replaces it instead of adding a
   * second one.
   */
  singletonKey?: string
}

/**
 * Background work on the same database (ARCH-35). Called from inside a use
 * case's transaction, so a rollback leaves no job behind.
 */
export type JobScheduler = {
  enqueue(name: string, data: object, options?: JobOptions): Promise<void>
  /** Absolute time, never a delay computed at handler time — clocks drift. */
  schedule(name: string, data: object, runAt: Date, options?: JobOptions): Promise<void>
  cancel(name: string, singletonKey: string): Promise<void>
}

/** Framework-free description of how hard a queue should try. */
export type JobRetryPolicy = {
  retryLimit?: number
  retryDelaySeconds?: number
  retryBackoff?: boolean
}

export type JobHandler<TData extends object = object> = {
  readonly jobName: string
  /** Overrides the default three attempts with exponential backoff. */
  readonly retryPolicy?: JobRetryPolicy
  /** Must be idempotent: pg-boss delivers at least once. */
  handle(data: TData): Promise<void>
}
