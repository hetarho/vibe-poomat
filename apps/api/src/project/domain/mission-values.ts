import { ValueObject } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import {
  QuestionsNotAllowedError,
  SlotsNotAllowedError,
  TaskTextNotAllowedError,
} from './mission-errors'

/** PROJ-13, all three of them. */
export const TASK_TEXT_MAX_LENGTH = 1000
export const QUESTION_MAX_LENGTH = 200
export const MAX_QUESTIONS = 3
export const MIN_SLOTS = 1
export const MAX_SLOTS = 10

/** PROJ-6: a mission nobody ends still stops taking feedback after 30 days. */
export const MISSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

export class TaskText extends ValueObject<{ value: string }> {
  private constructor(props: { value: string }) {
    super(props)
  }

  static create(raw: string): Result<TaskText, TaskTextNotAllowedError> {
    const value = raw.trim()
    if (value.length === 0) return err(new TaskTextNotAllowedError('task text is empty'))
    if ([...value].length > TASK_TEXT_MAX_LENGTH) {
      return err(
        new TaskTextNotAllowedError('task text is longer than the limit', {
          maxLength: TASK_TEXT_MAX_LENGTH,
        }),
      )
    }

    return ok(new TaskText({ value }))
  }

  get value(): string {
    return this.props.value
  }
}

/**
 * PROJ-4: up to three things the maker wants answered. Frozen for the life of
 * the mission (PROJ-7), because the answers have to be to the questions the
 * feedbacker was actually shown.
 */
export class MissionQuestions extends ValueObject<{ values: readonly string[] }> {
  private constructor(props: { values: readonly string[] }) {
    super(props)
  }

  static create(raw: readonly string[]): Result<MissionQuestions, QuestionsNotAllowedError> {
    if (raw.length > MAX_QUESTIONS) {
      return err(
        new QuestionsNotAllowedError('too many questions', { maxQuestions: MAX_QUESTIONS }),
      )
    }

    const values: string[] = []
    for (const question of raw) {
      const value = question.trim()
      if (value.length === 0) {
        return err(new QuestionsNotAllowedError('a question is empty'))
      }
      if ([...value].length > QUESTION_MAX_LENGTH) {
        return err(
          new QuestionsNotAllowedError('a question is longer than the limit', {
            maxLength: QUESTION_MAX_LENGTH,
          }),
        )
      }
      values.push(value)
    }

    return ok(new MissionQuestions({ values }))
  }

  get values(): readonly string[] {
    return this.props.values
  }
}

/** PROJ-13: one to ten, and exactly that many credits go into escrow (CRED-3). */
export class Slots extends ValueObject<{ count: number }> {
  private constructor(props: { count: number }) {
    super(props)
  }

  static create(raw: number): Result<Slots, SlotsNotAllowedError> {
    if (!Number.isInteger(raw) || raw < MIN_SLOTS || raw > MAX_SLOTS) {
      return err(
        new SlotsNotAllowedError('slots must be a whole number in range', {
          minSlots: MIN_SLOTS,
          maxSlots: MAX_SLOTS,
        }),
      )
    }

    return ok(new Slots({ count: raw }))
  }

  get count(): number {
    return this.props.count
  }
}
