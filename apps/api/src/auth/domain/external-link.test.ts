import { describe, expect, it } from 'vitest'
import { EXTERNAL_LINK_MAX_LENGTH, ExternalLink } from './external-link'

describe('ExternalLink', () => {
  it('accepts an https URL and normalises it', () => {
    expect(ExternalLink.create('  https://example.com  ')._unsafeUnwrap().value).toBe(
      'https://example.com/',
    )
  })

  it.each(['http://example.com', 'ftp://example.com', 'javascript:alert(1)'])(
    'rejects %s, since the link is rendered for other people to click',
    (raw) => {
      expect(ExternalLink.create(raw)._unsafeUnwrapErr().code).toBe('AUTH_LINK_NOT_ALLOWED')
    },
  )

  it.each(['not a url', 'example.com', ''])('rejects %j', (raw) => {
    expect(ExternalLink.create(raw).isErr()).toBe(true)
  })

  it('rejects a URL carrying credentials', () => {
    expect(ExternalLink.create('https://user:pass@example.com').isErr()).toBe(true)
  })

  it('rejects a link past the length limit', () => {
    const long = `https://example.com/${'a'.repeat(EXTERNAL_LINK_MAX_LENGTH)}`

    expect(ExternalLink.create(long).isErr()).toBe(true)
  })
})
