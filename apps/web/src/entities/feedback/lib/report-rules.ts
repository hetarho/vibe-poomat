import { feedback } from '@repo/contracts'

/**
 * FDBK-10, read from the contract rather than retyped: every required field and
 * every answer needs at least 20 characters. It is not a measure of effort — it
 * is the floor that stops an empty submission being called feedback.
 */
export const MIN_FIELD_LENGTH = feedback.MIN_FIELD_LENGTH
export const MAX_FIELD_LENGTH = feedback.MAX_FIELD_LENGTH

/** Counted in code points, as the server counts them, so an emoji costs one. */
export function fieldLength(value: string): number {
  return [...value.trim()].length
}

export function fieldProblem(value: string): string | null {
  const length = fieldLength(value)
  if (length === 0) return 'This one is required.'
  if (length < MIN_FIELD_LENGTH) {
    return `At least ${MIN_FIELD_LENGTH} characters — ${MIN_FIELD_LENGTH - length} to go.`
  }
  if (length > MAX_FIELD_LENGTH) {
    return `At most ${MAX_FIELD_LENGTH} characters.`
  }

  return null
}

/** FDBK-3's fixed shape. The order is the order the form asks in. */
export const REPORT_FIELDS = ['firstImpression', 'stuckAt', 'wouldPayReason', 'suggestion'] as const

export type ReportField = (typeof REPORT_FIELDS)[number]

export const REPORT_LABELS: Readonly<Record<ReportField, string>> = {
  firstImpression: 'First impression',
  stuckAt: 'Where I got stuck',
  wouldPayReason: 'Why, or why not',
  suggestion: 'One suggestion',
}

export type ReportDraft = Record<ReportField, string> & {
  wouldPay: boolean
  answers: string[]
}

export function emptyReport(questionCount: number): ReportDraft {
  return {
    firstImpression: '',
    stuckAt: '',
    wouldPay: false,
    wouldPayReason: '',
    suggestion: '',
    answers: Array.from({ length: questionCount }, () => ''),
  }
}

/** Every field and every answer, so submit is blocked before the request. */
export function reportProblems(draft: ReportDraft): Record<string, string> {
  const found: Record<string, string> = {}

  for (const field of REPORT_FIELDS) {
    const problem = fieldProblem(draft[field])
    if (problem !== null) found[field] = problem
  }
  draft.answers.forEach((answer, index) => {
    const problem = fieldProblem(answer)
    if (problem !== null) found[`answers.${index}`] = problem
  })

  return found
}
