import { Logger } from '@nestjs/common'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeEnv } from '../../test-support/fake-env'
import { createPool } from './create-pool'

describe('createPool', () => {
  const pools: { end: () => Promise<void> }[] = []

  afterEach(async () => {
    await Promise.all(pools.splice(0).map((pool) => pool.end()))
    vi.restoreAllMocks()
  })

  it('sizes the pool from config', () => {
    const pool = createPool(fakeEnv({ DATABASE_POOL_MAX: 4 }))
    pools.push(pool)

    expect(pool.options.max).toBe(4)
  })

  it('survives an idle client error instead of taking the process down', () => {
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const pool = createPool(fakeEnv())
    pools.push(pool)

    // an emitted 'error' with no listener is what Node turns into a fatal throw
    expect(() =>
      pool.emit('error', new Error('terminating connection due to administrator command')),
    ).not.toThrow()
    expect(logged).toHaveBeenCalledOnce()
  })
})
