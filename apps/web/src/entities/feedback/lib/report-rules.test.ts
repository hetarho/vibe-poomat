import { describe, expect, it } from 'vitest'
import {
  emptyReport,
  fieldLength,
  fieldProblem,
  MAX_FIELD_LENGTH,
  MIN_FIELD_LENGTH,
  REPORT_FIELDS,
  reportProblems,
} from './report-rules'

const ENOUGH = 'a'.repeat(MIN_FIELD_LENGTH)

describe('FDBK-10, the floor under every field', () => {
  it('refuses an empty field, and says it is required rather than counting', () => {
    expect(fieldProblem('   ')).toBe('This one is required.')
  })

  it('refuses one character short and says how many are left', () => {
    const problem = fieldProblem('a'.repeat(MIN_FIELD_LENGTH - 1))

    expect(problem).toContain(String(MIN_FIELD_LENGTH))
    expect(problem).toContain('1 to go')
  })

  it('accepts exactly the minimum', () => {
    expect(fieldProblem(ENOUGH)).toBeNull()
  })

  it('refuses one past the maximum', () => {
    expect(fieldProblem('a'.repeat(MAX_FIELD_LENGTH))).toBeNull()
    expect(fieldProblem('a'.repeat(MAX_FIELD_LENGTH + 1))).not.toBeNull()
  })

  it('measures what will be sent, which is the trimmed value', () => {
    expect(fieldProblem(`  ${'a'.repeat(MIN_FIELD_LENGTH - 1)}  `)).not.toBeNull()
  })

  it('charges one character for an emoji, as the server does', () => {
    expect(fieldLength('🙂')).toBe(1)
  })
})

describe('the whole report (FDBK-3)', () => {
  it('starts empty, with one answer slot per mission question', () => {
    expect(emptyReport(2).answers).toEqual(['', ''])
  })

  it('names every field that is short, and nothing that is not', () => {
    const draft = { ...emptyReport(0), firstImpression: ENOUGH }

    const problems = reportProblems(draft)

    expect(problems).not.toHaveProperty('firstImpression')
    for (const field of REPORT_FIELDS.filter((name) => name !== 'firstImpression')) {
      expect(problems).toHaveProperty(field)
    }
  })

  it('names a short answer by its position', () => {
    const draft = emptyReport(2)
    draft.answers = [ENOUGH, 'too short']

    expect(Object.keys(reportProblems(draft))).toContain('answers.1')
    expect(Object.keys(reportProblems(draft))).not.toContain('answers.0')
  })

  it('finds nothing wrong with a report that is entirely filled in', () => {
    const draft = { ...emptyReport(1), answers: [ENOUGH] }
    for (const field of REPORT_FIELDS) draft[field] = ENOUGH

    expect(reportProblems(draft)).toEqual({})
  })

  /** "Would you pay" is a choice, so `false` is an answer, not an empty field. */
  it('does not treat a "no" as a missing answer', () => {
    const draft = { ...emptyReport(0), wouldPay: false }
    for (const field of REPORT_FIELDS) draft[field] = ENOUGH

    expect(reportProblems(draft)).toEqual({})
  })
})
