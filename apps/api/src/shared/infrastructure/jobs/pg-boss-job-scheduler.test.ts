import type { PoolClient } from 'pg'
import type PgBoss from 'pg-boss'
import { describe, expect, it, vi } from 'vitest'
import type { Db } from '../../db/db.token'
import { transactionScope } from '../../db/transaction-scope'
import { JobRegistry, UNKNOWN_JOB_NAME } from './job-registry'
import { PgBossJobScheduler } from './pg-boss-job-scheduler'

const JOB_NAME = 'slot.release'

function scheduler() {
  const send = vi.fn(
    async (_name: string, _data: object, _options?: PgBoss.SendOptions) => 'job-id',
  )
  const cancel = vi.fn(async () => undefined)
  const executeSql = vi.fn(async () => ({ rows: [{ id: 'job-id' }] }))
  const boss = {
    send,
    cancel,
    getDb: () => ({ executeSql }),
  } as unknown as PgBoss
  const registry = new JobRegistry()
  registry.register({ jobName: JOB_NAME, handle: async () => undefined })

  return { scheduler: new PgBossJobScheduler(boss, registry), send, cancel, executeSql }
}

function inTransaction<T>(work: () => Promise<T>): Promise<T> {
  const client = { query: vi.fn(async () => ({ rows: [] })) } as unknown as PoolClient

  return transactionScope.run({ tx: {} as unknown as Db, client, events: [] }, work)
}

describe('PgBossJobScheduler', () => {
  it('sends without a connection override when there is no transaction', async () => {
    const { scheduler: subject, send } = scheduler()

    await subject.enqueue(JOB_NAME, { slotId: 'a' })

    expect(send).toHaveBeenCalledWith(JOB_NAME, { slotId: 'a' }, {})
  })

  it('sends through the ambient transaction, so a rollback leaves no job', async () => {
    const { scheduler: subject, send } = scheduler()

    await inTransaction(async () => subject.enqueue(JOB_NAME, { slotId: 'a' }))

    expect(send.mock.calls[0]?.[2]?.db).toBeDefined()
  })

  it('schedules at an absolute time, not a delay', async () => {
    const { scheduler: subject, send } = scheduler()
    const runAt = new Date('2026-09-08T00:00:00.000Z')

    await subject.schedule(JOB_NAME, { slotId: 'a' }, runAt, { singletonKey: 'slot:a' })

    expect(send).toHaveBeenCalledWith(
      JOB_NAME,
      { slotId: 'a' },
      { singletonKey: 'slot:a', startAfter: runAt },
    )
  })

  it('refuses a job name nobody handles, at the call site', async () => {
    const { scheduler: subject, send } = scheduler()

    await expect(subject.enqueue('mission.expire', {})).rejects.toThrow(UNKNOWN_JOB_NAME)
    expect(send).not.toHaveBeenCalled()
  })

  it('cancels the pending jobs it finds for a singleton key', async () => {
    const { scheduler: subject, cancel, executeSql } = scheduler()

    await subject.cancel(JOB_NAME, 'slot:a')

    expect(executeSql).toHaveBeenCalledOnce()
    expect(cancel).toHaveBeenCalledWith(JOB_NAME, ['job-id'], {})
  })

  it('does nothing when there is no pending job to cancel', async () => {
    const send = vi.fn(async () => 'id')
    const cancel = vi.fn(async () => undefined)
    const boss = {
      send,
      cancel,
      getDb: () => ({ executeSql: async () => ({ rows: [] }) }),
    } as unknown as PgBoss
    const registry = new JobRegistry()
    registry.register({ jobName: JOB_NAME, handle: async () => undefined })

    await new PgBossJobScheduler(boss, registry).cancel(JOB_NAME, 'slot:none')

    expect(cancel).not.toHaveBeenCalled()
  })
})
