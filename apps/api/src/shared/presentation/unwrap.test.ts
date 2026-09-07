import { HttpStatus } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { err, NotFoundError, ok, ValidationError } from '../result'
import { DomainHttpException } from './domain-http-exception'
import { unwrap } from './unwrap'

describe('unwrap', () => {
  it('hands back the value of an ok result', () => {
    expect(unwrap(ok({ id: 7 }))).toEqual({ id: 7 })
  })

  it('turns an err result into a DomainHttpException carrying the code and status', () => {
    try {
      unwrap(err(new NotFoundError('project not found')))
      expect.unreachable('unwrap should have thrown')
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(DomainHttpException)
      const exception = thrown as DomainHttpException
      expect(exception.code).toBe('NOT_FOUND')
      expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND)
      expect(exception.getResponse()).toEqual({ code: 'NOT_FOUND', message: 'project not found' })
    }
  })

  it('carries details through when the error has them', () => {
    try {
      unwrap(err(new ValidationError('invalid body', { fields: { title: 'required' } })))
      expect.unreachable('unwrap should have thrown')
    } catch (thrown) {
      expect((thrown as DomainHttpException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        message: 'invalid body',
        details: { fields: { title: 'required' } },
      })
    }
  })

  it('omits details entirely when there are none', () => {
    try {
      unwrap(err(new NotFoundError('gone')))
      expect.unreachable('unwrap should have thrown')
    } catch (thrown) {
      expect(Object.keys((thrown as DomainHttpException).getResponse() as object)).toEqual([
        'code',
        'message',
      ])
    }
  })
})
