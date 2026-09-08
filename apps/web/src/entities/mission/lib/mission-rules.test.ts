import { describe, expect, it } from 'vitest'
import {
  askedQuestions,
  balanceProblem,
  escrowCost,
  MAX_QUESTIONS,
  MAX_SLOTS,
  MIN_SLOTS,
  QUESTION_MAX_LENGTH,
  questionProblem,
  questionsProblem,
  slotsProblem,
  TASK_TEXT_MAX_LENGTH,
  taskTextProblem,
  textLength,
} from './mission-rules'

describe('the mission rules this side mirrors (PROJ-13)', () => {
  describe('task text', () => {
    it('refuses an empty one, because there would be nothing to do', () => {
      expect(taskTextProblem('   ')).not.toBeNull()
    })

    it('accepts exactly the limit and refuses one past it', () => {
      expect(taskTextProblem('a'.repeat(TASK_TEXT_MAX_LENGTH))).toBeNull()
      expect(taskTextProblem('a'.repeat(TASK_TEXT_MAX_LENGTH + 1))).not.toBeNull()
    })

    it('charges one character for an emoji, as the server does', () => {
      expect(textLength('🙂')).toBe(1)
    })
  })

  describe('questions', () => {
    it('accepts none at all, because they are optional', () => {
      expect(questionsProblem(['', '  '])).toBeNull()
      expect(askedQuestions(['', '  '])).toEqual([])
    })

    it('sends only the rows somebody filled in, trimmed', () => {
      expect(askedQuestions([' Was it clear? ', '', 'Would you use it?'])).toEqual([
        'Was it clear?',
        'Would you use it?',
      ])
    })

    it('accepts exactly the cap and refuses one past it', () => {
      const rows = Array.from({ length: MAX_QUESTIONS }, (_value, index) => `q${index}`)
      expect(questionsProblem(rows)).toBeNull()
      expect(questionsProblem([...rows, 'one too many'])).not.toBeNull()
    })

    it('refuses one longer than the limit', () => {
      expect(questionProblem('a'.repeat(QUESTION_MAX_LENGTH))).toBeNull()
      expect(questionProblem('a'.repeat(QUESTION_MAX_LENGTH + 1))).not.toBeNull()
      expect(questionsProblem(['fine', 'a'.repeat(QUESTION_MAX_LENGTH + 1)])).not.toBeNull()
    })
  })

  describe('slots', () => {
    it('accepts both ends of the range', () => {
      expect(slotsProblem(MIN_SLOTS)).toBeNull()
      expect(slotsProblem(MAX_SLOTS)).toBeNull()
    })

    it.each([MIN_SLOTS - 1, MAX_SLOTS + 1, 0, -3])('refuses %i', (slots) => {
      expect(slotsProblem(slots)).not.toBeNull()
    })

    it('refuses a number that is not whole, because credits are not (CRED-1)', () => {
      expect(slotsProblem(1.5)).not.toBeNull()
    })

    it('refuses whatever an emptied number input produces', () => {
      expect(slotsProblem(Number.NaN)).not.toBeNull()
    })
  })

  describe('the escrow cost (CRED-3)', () => {
    it('is one credit per slot', () => {
      expect(escrowCost(1)).toBe(1)
      expect(escrowCost(MAX_SLOTS)).toBe(MAX_SLOTS)
    })

    it('is affordable when the balance covers it exactly', () => {
      expect(balanceProblem(2, 2)).toBeNull()
    })

    it('is refused when the balance is one short, and says both numbers', () => {
      const problem = balanceProblem(3, 2)

      expect(problem).toContain('3')
      expect(problem).toContain('2')
    })

    it('says "credit" in the singular for one', () => {
      expect(balanceProblem(1, 0)).toContain('1 credit ')
    })
  })
})
