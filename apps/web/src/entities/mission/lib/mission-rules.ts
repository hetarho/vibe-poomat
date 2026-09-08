import { projects } from '@repo/contracts'

/**
 * PROJ-13, read from the contract rather than retyped. PROJ-7 freezes all of it
 * once the mission opens, which is why there is no editing counterpart: these
 * rules only ever run on the way in.
 */
export const TASK_TEXT_MAX_LENGTH = projects.TASK_TEXT_MAX_LENGTH
export const QUESTION_MAX_LENGTH = projects.QUESTION_MAX_LENGTH
export const MAX_QUESTIONS = projects.MAX_QUESTIONS
export const MIN_SLOTS = projects.MIN_SLOTS
export const MAX_SLOTS = projects.MAX_SLOTS

/** Counted in code points, as the server counts them, so an emoji costs one. */
export function textLength(value: string): number {
  return [...value.trim()].length
}

export function taskTextProblem(value: string): string | null {
  const length = textLength(value)
  if (length === 0) return 'Say what a feedbacker should try.'
  if (length > TASK_TEXT_MAX_LENGTH) {
    return `A task may be at most ${TASK_TEXT_MAX_LENGTH} characters.`
  }

  return null
}

/** An empty row is dropped rather than refused; a long one is refused. */
export function questionProblem(value: string): string | null {
  if (textLength(value) > QUESTION_MAX_LENGTH) {
    return `A question may be at most ${QUESTION_MAX_LENGTH} characters.`
  }

  return null
}

/** Only the rows somebody actually filled in are sent. */
export function askedQuestions(rows: readonly string[]): string[] {
  return rows.map((row) => row.trim()).filter((row) => row.length > 0)
}

export function questionsProblem(rows: readonly string[]): string | null {
  const asked = askedQuestions(rows)
  if (asked.length > MAX_QUESTIONS) return `You may ask at most ${MAX_QUESTIONS} questions.`

  const tooLong = rows.find((row) => questionProblem(row) !== null)

  return tooLong === undefined ? null : (questionProblem(tooLong) as string)
}

export function slotsProblem(slots: number): string | null {
  if (!Number.isInteger(slots)) return 'Pick a whole number of slots.'
  if (slots < MIN_SLOTS || slots > MAX_SLOTS) {
    return `A mission has between ${MIN_SLOTS} and ${MAX_SLOTS} slots.`
  }

  return null
}

/** CRED-3: one credit per slot, escrowed the moment the mission opens. */
export function escrowCost(slots: number): number {
  return slots
}

/**
 * CRED-3's refusal, said before the request rather than after. This is an
 * affordance only: the balance here can be stale, so the server's own
 * `CREDIT_INSUFFICIENT` still has to be rendered when it comes back.
 */
export function balanceProblem(slots: number, balance: number): string | null {
  const cost = escrowCost(slots)
  if (cost <= balance) return null

  return `That costs ${cost} ${cost === 1 ? 'credit' : 'credits'} and you have ${balance}. Give feedback to earn more, or ask for fewer slots.`
}
