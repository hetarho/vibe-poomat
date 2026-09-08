import { describe, expect, it } from 'vitest'
import { DEFAULT_RETURN_TO, safeReturnTo } from './return-to'

describe('safeReturnTo', () => {
  it.each(['/', '/projects/42', '/settings?tab=profile', '/@ada'])('keeps %s', (path) => {
    expect(safeReturnTo(path)).toBe(path)
  })

  it.each([
    ['//evil.test', 'protocol-relative, which a browser reads as another origin'],
    ['/\\evil.test', 'a backslash is a slash to enough parsers'],
    ['https://evil.test', 'an absolute URL'],
    ['javascript:alert(1)', 'a scheme that is not navigation at all'],
    ['projects/42', 'not anchored at the site root'],
  ])('refuses %s — %s', (path) => {
    expect(safeReturnTo(path)).toBe(DEFAULT_RETURN_TO)
  })

  it('refuses a value carrying a newline, which would split the Location header', () => {
    expect(safeReturnTo('/ok\r\nSet-Cookie: session=stolen')).toBe(DEFAULT_RETURN_TO)
  })

  it.each([undefined, null, '', '   '])('falls back for %j', (raw) => {
    expect(safeReturnTo(raw)).toBe(DEFAULT_RETURN_TO)
  })

  it('refuses an absurdly long path rather than putting it in a header', () => {
    expect(safeReturnTo(`/${'a'.repeat(600)}`)).toBe(DEFAULT_RETURN_TO)
  })
})
