import { describe, expect, it } from 'vitest'
import { MAX_FIELD_LENGTH, MIN_FIELD_LENGTH, parseReport, ReportField } from './report'

const ENOUGH = 'a'.repeat(MIN_FIELD_LENGTH)
const TOO_SHORT = 'a'.repeat(MIN_FIELD_LENGTH - 1)

function raw(overrides: Record<string, unknown> = {}) {
  return {
    firstImpression: ENOUGH,
    stuckAt: ENOUGH,
    wouldPay: true,
    wouldPayReason: ENOUGH,
    suggestion: ENOUGH,
    answers: [] as string[],
    ...overrides,
  }
}

describe('ReportField (FDBK-10)', () => {
  it('accepts exactly the minimum', () => {
    expect(ReportField.create('stuckAt', ENOUGH)._unsafeUnwrap().value).toBe(ENOUGH)
  })

  it('refuses one character short, naming the field', () => {
    const outcome = ReportField.create('stuckAt', TOO_SHORT)

    expect(outcome._unsafeUnwrapErr().code).toBe('VALIDATION_FAILED')
    expect(outcome._unsafeUnwrapErr().details).toMatchObject({ stuckAt: expect.any(Array) })
  })

  it('measures after trimming, so padding is not content', () => {
    expect(ReportField.create('stuckAt', `  ${TOO_SHORT}  `).isErr()).toBe(true)
    expect(ReportField.create('stuckAt', ' '.repeat(100)).isErr()).toBe(true)
  })

  it('refuses one past the upper limit', () => {
    expect(ReportField.create('stuckAt', 'a'.repeat(MAX_FIELD_LENGTH + 1)).isErr()).toBe(true)
  })
})

describe('parseReport (FDBK-3)', () => {
  it('keeps every field a report is required to have', () => {
    const report = parseReport(raw({ wouldPay: false }), 0)._unsafeUnwrap()

    expect(report.wouldPay).toBe(false)
    expect(report.firstImpression.value).toBe(ENOUGH)
    expect(report.answers).toEqual([])
  })

  it.each(['firstImpression', 'stuckAt', 'wouldPayReason', 'suggestion'])(
    'refuses a short %s, naming it',
    (field) => {
      const outcome = parseReport(raw({ [field]: TOO_SHORT }), 0)

      expect(outcome._unsafeUnwrapErr().details).toMatchObject({ [field]: expect.any(Array) })
    },
  )

  it('takes one answer per mission question, positionally', () => {
    const report = parseReport(raw({ answers: [ENOUGH, ENOUGH] }), 2)._unsafeUnwrap()

    expect(report.answers.map((answer) => answer.value)).toEqual([ENOUGH, ENOUGH])
  })

  it.each([
    ['one missing', [ENOUGH], 2],
    ['one too many', [ENOUGH, ENOUGH], 1],
    ['none at all', [], 1],
  ])('refuses %s', (_case, answers, questions) => {
    const outcome = parseReport(raw({ answers }), questions)

    expect(outcome._unsafeUnwrapErr().details).toMatchObject({ answers: expect.any(Array) })
  })

  it('names which answer was too short', () => {
    const outcome = parseReport(raw({ answers: [ENOUGH, TOO_SHORT] }), 2)

    expect(outcome._unsafeUnwrapErr().details).toMatchObject({ 'answers.1': expect.any(Array) })
  })

  it('accepts an empty list when the mission asked nothing', () => {
    expect(parseReport(raw({ answers: [] }), 0).isOk()).toBe(true)
  })
})
