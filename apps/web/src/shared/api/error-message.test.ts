import { ApiError } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { errorMessage, FALLBACK_ERROR_MESSAGE, isKnownErrorCode } from './error-message'

describe('errorMessage', () => {
  it('has copy for a code the api documents', () => {
    const message = errorMessage(new ApiError(404, { code: 'NOT_FOUND', message: 'gone' }))

    expect(message).toBe('That is not here any more.')
  })

  it('falls back for an unmapped code and never shows the server sentence', () => {
    const serverText = 'pq: relation "projects" does not exist'
    const message = errorMessage(
      new ApiError(400, { code: 'PROJ_WEIRD_STATE', message: serverText }),
    )

    expect(message).toBe(FALLBACK_ERROR_MESSAGE)
    expect(message).not.toContain(serverText)
  })

  it('falls back for anything that is not an ApiError', () => {
    expect(errorMessage(new Error('kaboom'))).toBe(FALLBACK_ERROR_MESSAGE)
    expect(errorMessage(undefined)).toBe(FALLBACK_ERROR_MESSAGE)
  })

  it('reports which codes it knows', () => {
    expect(isKnownErrorCode('VALIDATION_FAILED')).toBe(true)
    expect(isKnownErrorCode('PROJ_WEIRD_STATE')).toBe(false)
  })
})
