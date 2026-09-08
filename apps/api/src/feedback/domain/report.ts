import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'

/** FDBK-10: enough to block an empty submission, not to measure effort. */
export const MIN_FIELD_LENGTH = 20
export const MAX_FIELD_LENGTH = 4000

export class ReportFieldNotAllowedError extends ValidationError {
  override readonly code = 'VALIDATION_FAILED'
}

/**
 * One written answer, long enough to be an answer. The length is measured after
 * trimming, so whitespace does not pass for content — which is the whole point
 * of FDBK-10.
 */
export class ReportField extends ValueObject<{ value: string; field: string }> {
  private constructor(props: { value: string; field: string }) {
    super(props)
  }

  static create(field: string, raw: string): Result<ReportField, ReportFieldNotAllowedError> {
    const value = raw.trim()
    const length = [...value].length

    if (length < MIN_FIELD_LENGTH) {
      return err(
        new ReportFieldNotAllowedError('this answer is too short', {
          [field]: [`needs at least ${MIN_FIELD_LENGTH} characters`],
        }),
      )
    }

    if (length > MAX_FIELD_LENGTH) {
      return err(
        new ReportFieldNotAllowedError('this answer is too long', {
          [field]: [`may be at most ${MAX_FIELD_LENGTH} characters`],
        }),
      )
    }

    return ok(new ReportField({ value, field }))
  }

  get value(): string {
    return this.props.value
  }

  get field(): string {
    return this.props.field
  }
}

/** FDBK-3, all of it required: the baseline every report has to clear. */
export type Report = {
  firstImpression: ReportField
  stuckAt: ReportField
  wouldPay: boolean
  wouldPayReason: ReportField
  suggestion: ReportField
  /** Positional against the mission's frozen questions (PROJ-7). */
  answers: readonly ReportField[]
}

export type RawReport = {
  firstImpression: string
  stuckAt: string
  wouldPay: boolean
  wouldPayReason: string
  suggestion: string
  answers: readonly string[]
}

/**
 * Every field is checked before any of them is kept, and the failure names the
 * field so the form can put the message where it belongs (FDBK-10).
 */
export function parseReport(
  raw: RawReport,
  questionCount: number,
): Result<Report, ReportFieldNotAllowedError> {
  if (raw.answers.length !== questionCount) {
    return err(
      new ReportFieldNotAllowedError('every mission question needs an answer', {
        answers: [`expected ${questionCount} answer(s), got ${raw.answers.length}`],
      }),
    )
  }

  const fields = [
    ['firstImpression', raw.firstImpression],
    ['stuckAt', raw.stuckAt],
    ['wouldPayReason', raw.wouldPayReason],
    ['suggestion', raw.suggestion],
  ] as const

  const parsed: ReportField[] = []
  for (const [field, value] of fields) {
    const checked = ReportField.create(field, value)
    if (checked.isErr()) return err(checked.error)
    parsed.push(checked.value)
  }

  const answers: ReportField[] = []
  for (const [index, answer] of raw.answers.entries()) {
    const checked = ReportField.create(`answers.${index}`, answer)
    if (checked.isErr()) return err(checked.error)
    answers.push(checked.value)
  }

  const [firstImpression, stuckAt, wouldPayReason, suggestion] = parsed as [
    ReportField,
    ReportField,
    ReportField,
    ReportField,
  ]

  return ok({
    firstImpression,
    stuckAt,
    wouldPay: raw.wouldPay,
    wouldPayReason,
    suggestion,
    answers,
  })
}
