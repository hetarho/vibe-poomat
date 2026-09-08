import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from './unique-violation'

function pgError(constraint: string): Error {
  return Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint,
  })
}

describe('isUniqueViolation', () => {
  it('recognises the driver error itself', () => {
    expect(isUniqueViolation(pgError('users_handle_unique'), 'users_handle_unique')).toBe(true)
  })

  it('recognises it through the wrapper Drizzle reports the statement as', () => {
    const wrapped = new Error('Failed query', { cause: pgError('users_handle_unique') })

    expect(isUniqueViolation(wrapped, 'users_handle_unique')).toBe(true)
  })

  it('says no to another constraint on the same table', () => {
    expect(isUniqueViolation(pgError('users_pkey'), 'users_handle_unique')).toBe(false)
  })

  it('says no to a different SQLSTATE', () => {
    const notNull = Object.assign(new Error('null value'), {
      code: '23502',
      constraint: 'users_handle_unique',
    })

    expect(isUniqueViolation(notNull, 'users_handle_unique')).toBe(false)
  })

  it.each([null, undefined, 'boom', 42])('says no to %j', (error) => {
    expect(isUniqueViolation(error, 'users_handle_unique')).toBe(false)
  })

  it('gives up rather than looping on a cause that points at itself', () => {
    const looping: { cause?: unknown } = {}
    looping.cause = looping

    expect(isUniqueViolation(looping, 'users_handle_unique')).toBe(false)
  })
})
