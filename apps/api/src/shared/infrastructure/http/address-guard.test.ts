import { describe, expect, it } from 'vitest'
import {
  BLOCKED_CREDENTIALS,
  BLOCKED_PORT,
  BLOCKED_SCHEME,
  checkUrlShape,
  isBlockedAddress,
} from './address-guard'

describe('isBlockedAddress', () => {
  it.each([
    ['loopback', '127.0.0.1'],
    ['loopback, anywhere in the block', '127.9.9.9'],
    ['this host', '0.0.0.0'],
    ['private class A', '10.1.2.3'],
    ['private class B', '172.16.5.4'],
    ['private class C', '192.168.1.1'],
    ['CGNAT', '100.64.0.1'],
    ['link-local', '169.254.1.1'],
    ['the cloud metadata service', '169.254.169.254'],
    ['multicast', '239.0.0.1'],
    ['reserved', '240.0.0.1'],
    ['IPv6 loopback', '::1'],
    ['the IPv6 unspecified address', '::'],
    ['IPv6 unique local', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['IPv6 multicast', 'ff02::1'],
    ['an IPv4-mapped loopback', '::ffff:127.0.0.1'],
    ['an IPv4-mapped private address', '::ffff:10.0.0.1'],
    ['something that is not an address at all', 'localhost'],
  ])('blocks %s', (_label, address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each([
    ['a public IPv4', '93.184.216.34'],
    ['another public IPv4', '1.1.1.1'],
    ['a public IPv6', '2606:4700:4700::1111'],
    ['an IPv4-mapped public address', '::ffff:93.184.216.34'],
  ])('allows %s', (_label, address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })
})

describe('checkUrlShape', () => {
  it('accepts a plain https URL', () => {
    const shape = checkUrlShape('https://example.test/path')

    expect('url' in shape && shape.url.hostname).toBe('example.test')
  })

  it.each([
    ['http', 'http://example.test', BLOCKED_SCHEME],
    ['file', 'file:///etc/passwd', BLOCKED_SCHEME],
    ['gopher', 'gopher://example.test', BLOCKED_SCHEME],
    ['credentials in the URL', 'https://user:pw@example.test', BLOCKED_CREDENTIALS],
    ['a non-standard port', 'https://example.test:8443', BLOCKED_PORT],
  ])('rejects %s', (_label, candidate, reason) => {
    expect(checkUrlShape(candidate)).toEqual({ reason })
  })

  it('rejects something that is not a URL', () => {
    expect(checkUrlShape('not a url')).toEqual({ reason: 'is not a URL' })
  })
})
