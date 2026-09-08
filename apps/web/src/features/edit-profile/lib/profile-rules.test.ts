import { describe, expect, it } from 'vitest'
import {
  BIO_MAX_LENGTH,
  bioLength,
  bioProblem,
  DISPLAY_NAME_MAX_LENGTH,
  displayNameProblem,
  linkProblem,
} from './profile-rules'

describe('the rules this form mirrors from the server', () => {
  describe('display name', () => {
    it('accepts an ordinary one', () => {
      expect(displayNameProblem('Ada Lovelace')).toBeNull()
    })

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
    ])('refuses one that is %s', (_name, value) => {
      expect(displayNameProblem(value)).not.toBeNull()
    })

    it('accepts exactly the limit and refuses one past it', () => {
      expect(displayNameProblem('a'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull()
      expect(displayNameProblem('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).not.toBeNull()
    })
  })

  describe('bio (AUTH-3)', () => {
    it('accepts an empty one, because a bio is optional', () => {
      expect(bioProblem('')).toBeNull()
    })

    it('accepts exactly 160 and refuses 161', () => {
      expect(bioProblem('a'.repeat(BIO_MAX_LENGTH))).toBeNull()
      expect(bioProblem('a'.repeat(BIO_MAX_LENGTH + 1))).not.toBeNull()
    })

    /** Counted in code points, as the server counts them. */
    it('charges one character for an emoji, not two', () => {
      expect(bioLength('🙂')).toBe(1)
      expect(bioProblem('🙂'.repeat(BIO_MAX_LENGTH))).toBeNull()
      expect(bioProblem('🙂'.repeat(BIO_MAX_LENGTH + 1))).not.toBeNull()
    })

    it('measures what will be sent, which is the trimmed value', () => {
      expect(bioProblem(`  ${'a'.repeat(BIO_MAX_LENGTH)}  `)).toBeNull()
    })
  })

  describe('link (AUTH-3)', () => {
    it('accepts an https URL', () => {
      expect(linkProblem('https://ada.test/about')).toBeNull()
    })

    it('accepts an empty one, because a link is optional', () => {
      expect(linkProblem('  ')).toBeNull()
    })

    it.each([
      ['http', 'http://ada.test'],
      ['ftp', 'ftp://ada.test'],
      ['javascript', 'javascript:alert(1)'],
    ])('refuses a %s URL, as the server does', (_name, value) => {
      expect(linkProblem(value)).not.toBeNull()
    })

    it('refuses something that is not a URL at all', () => {
      expect(linkProblem('ada.test')).not.toBeNull()
    })

    /** The server's reason: credentials in a public link are a mistake or an attack. */
    it('refuses one carrying a password', () => {
      expect(linkProblem('https://ada:secret@ada.test')).not.toBeNull()
    })
  })
})
