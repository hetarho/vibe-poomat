import { describe, expect, it } from 'vitest'
import {
  DESCRIPTION_MAX_LENGTH,
  descriptionProblem,
  liveUrlProblem,
  MAX_TAGS,
  PITCH_MAX_LENGTH,
  PROJECT_TAGS,
  pitchProblem,
  TITLE_MAX_LENGTH,
  tagsProblem,
  textLength,
  titleProblem,
} from './project-rules'

describe('the project rules this side mirrors from the server (PROJ-1)', () => {
  describe('title', () => {
    it('accepts an ordinary one', () => {
      expect(titleProblem('Poomat')).toBeNull()
    })

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
    ])('refuses one that is %s', (_name, value) => {
      expect(titleProblem(value)).not.toBeNull()
    })

    it('accepts exactly the limit and refuses one past it', () => {
      expect(titleProblem('a'.repeat(TITLE_MAX_LENGTH))).toBeNull()
      expect(titleProblem('a'.repeat(TITLE_MAX_LENGTH + 1))).not.toBeNull()
    })
  })

  describe('pitch', () => {
    it('refuses an empty one, because the feed card would have nothing on it', () => {
      expect(pitchProblem('  ')).not.toBeNull()
    })

    it('accepts exactly the limit and refuses one past it', () => {
      expect(pitchProblem('a'.repeat(PITCH_MAX_LENGTH))).toBeNull()
      expect(pitchProblem('a'.repeat(PITCH_MAX_LENGTH + 1))).not.toBeNull()
    })
  })

  describe('description', () => {
    it('accepts an empty one, because a description is optional', () => {
      expect(descriptionProblem('')).toBeNull()
    })

    it('accepts exactly the limit and refuses one past it', () => {
      expect(descriptionProblem('a'.repeat(DESCRIPTION_MAX_LENGTH))).toBeNull()
      expect(descriptionProblem('a'.repeat(DESCRIPTION_MAX_LENGTH + 1))).not.toBeNull()
    })
  })

  /** Code points, as the server counts them, so an emoji costs one character. */
  describe('the counter', () => {
    it('charges one character for an emoji, not two', () => {
      expect(textLength('🙂')).toBe(1)
      expect(titleProblem('🙂'.repeat(TITLE_MAX_LENGTH))).toBeNull()
      expect(titleProblem('🙂'.repeat(TITLE_MAX_LENGTH + 1))).not.toBeNull()
    })

    it('measures what will be sent, which is the trimmed value', () => {
      expect(textLength(`  ${'a'.repeat(10)}  `)).toBe(10)
    })
  })

  describe('live url (PROJ-2)', () => {
    it('accepts an https URL', () => {
      expect(liveUrlProblem('https://poomat.test')).toBeNull()
    })

    it('refuses an empty one, because there would be nothing to try', () => {
      expect(liveUrlProblem('  ')).not.toBeNull()
    })

    it.each([
      ['http', 'http://poomat.test'],
      ['ftp', 'ftp://poomat.test'],
      ['javascript', 'javascript:alert(1)'],
    ])('refuses a %s URL, as the server does', (_name, value) => {
      expect(liveUrlProblem(value)).not.toBeNull()
    })

    it('refuses something that is not a URL at all', () => {
      expect(liveUrlProblem('poomat.test')).not.toBeNull()
    })

    it('refuses one carrying a password', () => {
      expect(liveUrlProblem('https://ada:secret@poomat.test')).not.toBeNull()
    })
  })

  describe('tags (PROJ-3)', () => {
    it('refuses none at all', () => {
      expect(tagsProblem([])).not.toBeNull()
    })

    it('accepts one, and accepts exactly the cap', () => {
      expect(tagsProblem([PROJECT_TAGS[0]])).toBeNull()
      expect(tagsProblem(PROJECT_TAGS.slice(0, MAX_TAGS))).toBeNull()
    })

    it('refuses one past the cap', () => {
      expect(tagsProblem(PROJECT_TAGS.slice(0, MAX_TAGS + 1))).not.toBeNull()
    })
  })
})
