import type PgBoss from 'pg-boss'
import type { JobRetryPolicy } from '../../application'

/** Three attempts with exponential backoff, then the dead-letter queue. */
export const JOB_RETRY_LIMIT = 3
export const JOB_RETRY_DELAY_SECONDS = 5
export const DEAD_LETTER_SUFFIX = '.dead-letter'

export function deadLetterQueueFor(jobName: string): string {
  return `${jobName}${DEAD_LETTER_SUFFIX}`
}

/** One policy per queue, applied when the queue is created at boot. */
export function queueOptionsFor(
  jobName: string,
  policy?: JobRetryPolicy,
): Omit<PgBoss.Queue, 'name'> {
  return {
    retryLimit: policy?.retryLimit ?? JOB_RETRY_LIMIT,
    retryDelay: policy?.retryDelaySeconds ?? JOB_RETRY_DELAY_SECONDS,
    retryBackoff: policy?.retryBackoff ?? true,
    deadLetter: deadLetterQueueFor(jobName),
  }
}
