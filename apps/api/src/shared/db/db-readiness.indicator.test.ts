import { describe, expect, it, vi } from 'vitest'
import { DbReadinessIndicator, type Queryable } from './db-readiness.indicator'

const answering: Queryable = { query: async () => ({ rows: [{ one: 1 }] }) }

describe('DbReadinessIndicator', () => {
  it('is named db, so /ready reports it under that key', () => {
    expect(new DbReadinessIndicator(answering).name).toBe('db')
  })

  it('passes when the database answers', async () => {
    await expect(new DbReadinessIndicator(answering).check()).resolves.toBe(true)
  })

  it('asks the database the cheapest possible question', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    await new DbReadinessIndicator({ query }).check()

    expect(query).toHaveBeenCalledWith('select 1')
  })

  it('fails when the query rejects', async () => {
    const rejecting: Queryable = {
      query: async () => {
        throw new Error('ECONNREFUSED')
      },
    }

    await expect(new DbReadinessIndicator(rejecting).check()).resolves.toBe(false)
  })

  it('fails rather than hanging when the query never settles', async () => {
    const hanging: Queryable = { query: () => new Promise(() => undefined) }

    await expect(new DbReadinessIndicator(hanging, 20).check()).resolves.toBe(false)
  })
})
