import { describe, expect, it } from 'vitest'
import {
  DEAD_LETTER_SUFFIX,
  deadLetterQueueFor,
  JOB_RETRY_DELAY_SECONDS,
  JOB_RETRY_LIMIT,
  queueOptionsFor,
} from './job-policy'

describe('the job policy', () => {
  it('names a dead-letter queue after the queue it backs', () => {
    expect(deadLetterQueueFor('feedback.auto-accept')).toBe(
      `feedback.auto-accept${DEAD_LETTER_SUFFIX}`,
    )
  })

  it('gives every queue three attempts with exponential backoff, then a dead letter', () => {
    expect(queueOptionsFor('slot.release')).toEqual({
      retryLimit: JOB_RETRY_LIMIT,
      retryDelay: JOB_RETRY_DELAY_SECONDS,
      retryBackoff: true,
      deadLetter: deadLetterQueueFor('slot.release'),
    })
    expect(JOB_RETRY_LIMIT).toBe(3)
  })

  it('lets a queue that needs a different policy say so', () => {
    expect(
      queueOptionsFor('probe.flaky', { retryLimit: 1, retryDelaySeconds: 0, retryBackoff: false }),
    ).toEqual({
      retryLimit: 1,
      retryDelay: 0,
      retryBackoff: false,
      deadLetter: deadLetterQueueFor('probe.flaky'),
    })
  })
})
