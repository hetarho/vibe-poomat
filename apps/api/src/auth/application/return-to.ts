/** Where a sign-in with no usable `returnTo` lands. */
export const DEFAULT_RETURN_TO = '/'

const MAX_RETURN_TO_LENGTH = 512

const SPACE = 0x20
const DELETE = 0x7f

/**
 * A control character or a newline can split a `Location` header, and a
 * backslash is a slash to enough parsers that `/\evil.test` is not worth
 * arguing about.
 */
function carriesSomethingAHeaderShouldNot(value: string): boolean {
  for (const character of value) {
    if (character === '\\') return true

    const code = character.codePointAt(0) ?? 0
    if (code <= SPACE || code === DELETE) return true
  }

  return false
}

/**
 * `returnTo` arrives from a query string and ends up in a `Location` header, so
 * it is the classic open-redirect hole. Only a path on our own site survives:
 * one leading slash, nothing a browser would read as protocol-relative
 * (`//evil.test`), and no scheme.
 */
export function safeReturnTo(raw: string | undefined | null): string {
  if (raw === undefined || raw === null) return DEFAULT_RETURN_TO

  const value = raw.trim()
  if (value.length === 0 || value.length > MAX_RETURN_TO_LENGTH) return DEFAULT_RETURN_TO
  if (!value.startsWith('/')) return DEFAULT_RETURN_TO
  if (value.startsWith('//')) return DEFAULT_RETURN_TO
  if (carriesSomethingAHeaderShouldNot(value)) return DEFAULT_RETURN_TO

  return value
}
