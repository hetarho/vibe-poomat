import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api'
import { serverProblems } from './server-problems'

function refusal(code: string, details?: unknown): ApiError {
  return new ApiError(422, {
    code,
    message: 'server text nobody reads',
    ...(details === undefined ? {} : { details }),
  })
}

describe('what the api said, put on the field it said it about', () => {
  it('puts an unreachable URL on the URL field, with the status it observed', () => {
    const problems = serverProblems(
      refusal('PROJECT_URL_UNREACHABLE', { url: 'https://x.test', status: 503 }),
    )

    expect(problems.liveUrl).toContain('503')
  })

  it('still names the URL field when the probe never got a status at all', () => {
    const problems = serverProblems(refusal('PROJECT_URL_UNREACHABLE', { reason: 'dns' }))

    expect(problems.liveUrl).not.toBeUndefined()
    expect(problems.liveUrl).not.toContain('undefined')
  })

  it.each([
    ['PROJECT_TITLE_NOT_ALLOWED', 'title'],
    ['PROJECT_PITCH_NOT_ALLOWED', 'pitch'],
    ['PROJECT_DESCRIPTION_NOT_ALLOWED', 'description'],
    ['PROJECT_URL_NOT_ALLOWED', 'liveUrl'],
    ['PROJECT_TAGS_NOT_ALLOWED', 'tags'],
    ['PROJECT_COVER_NOT_ALLOWED', 'cover'],
  ])('puts %s on the %s field', (code, field) => {
    expect(Object.keys(serverProblems(refusal(code)))).toEqual([field])
  })

  /** PROJ-7 arrives as a conflict, and the field it is about is the URL. */
  it('explains a mission lock on the URL field', () => {
    expect(serverProblems(refusal('PROJECT_LOCKED_BY_MISSION')).liveUrl).toMatch(/mission is open/i)
  })

  /** T006's map, which already names its fields. */
  it('passes a validation map through as it arrived', () => {
    const problems = serverProblems(refusal('VALIDATION_FAILED', { pitch: ['must not be empty'] }))

    expect(problems).toEqual({ pitch: 'must not be empty' })
  })

  it('renders no server text for a code it does not know', () => {
    expect(serverProblems(refusal('SOMETHING_NEW'))).toEqual({})
  })

  it('has nothing to say about a failure that is not the api at all', () => {
    expect(serverProblems(new Error('offline'))).toEqual({})
  })
})
