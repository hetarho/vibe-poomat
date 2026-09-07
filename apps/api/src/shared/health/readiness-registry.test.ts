import { describe, expect, it } from 'vitest'
import { ReadinessRegistry } from './readiness-registry'

describe('ReadinessRegistry', () => {
  it('reports ready with an empty checks map when nothing is registered', async () => {
    await expect(new ReadinessRegistry().report()).resolves.toEqual({ ready: true, checks: {} })
  })

  it('is ready only when every indicator passes', async () => {
    const registry = new ReadinessRegistry()
    registry.register({ name: 'db', check: async () => true })
    registry.register({ name: 'queue', check: async () => false })

    await expect(registry.report()).resolves.toEqual({
      ready: false,
      checks: { db: true, queue: false },
    })
  })

  it('treats a throwing indicator as failed instead of failing the whole probe', async () => {
    const registry = new ReadinessRegistry()
    registry.register({ name: 'ok', check: async () => true })
    registry.register({
      name: 'boom',
      check: async () => {
        throw new Error('connection refused')
      },
    })

    await expect(registry.report()).resolves.toEqual({
      ready: false,
      checks: { ok: true, boom: false },
    })
  })

  it('replaces an indicator registered twice under the same name', async () => {
    const registry = new ReadinessRegistry()
    registry.register({ name: 'db', check: async () => false })
    registry.register({ name: 'db', check: async () => true })

    await expect(registry.report()).resolves.toEqual({ ready: true, checks: { db: true } })
  })
})
