import { isIPv4, isIPv6 } from 'node:net'

export const BLOCKED_ADDRESS = 'resolves to an address that is not publicly routable'
export const BLOCKED_SCHEME = 'must be an https URL'
export const BLOCKED_CREDENTIALS = 'must not carry credentials'
export const BLOCKED_PORT = 'must use the standard https port'

/** CIDR blocks that must never be reachable from this service. */
const BLOCKED_V4: readonly [string, number][] = [
  ['0.0.0.0', 8], // "this host"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including the 169.254.169.254 metadata service
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved
]

const V4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i

function toV4Number(address: string): number | undefined {
  const parts = address.split('.').map((part) => Number(part))
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return undefined
  }

  return (
    ((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)
  )
}

function isBlockedV4(address: string): boolean {
  const value = toV4Number(address)
  if (value === undefined) return true

  return BLOCKED_V4.some(([base, bits]) => {
    const baseValue = toV4Number(base)
    if (baseValue === undefined) return false
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0

    return (value & mask) >>> 0 === (baseValue & mask) >>> 0
  })
}

function isBlockedV6(address: string): boolean {
  const normalised = address.toLowerCase().split('%')[0] ?? ''

  // an IPv4-mapped address is really an IPv4 address, and must be judged as one
  const mapped = V4_MAPPED.exec(normalised)
  if (mapped?.[1] !== undefined) return isBlockedV4(mapped[1])

  if (normalised === '::' || normalised === '::1') return true
  if (/^f[cd][0-9a-f]{2}:/.test(normalised)) return true // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(normalised)) return true // link-local fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(normalised)) return true // multicast
  if (normalised.startsWith('64:ff9b:')) return true // NAT64
  if (normalised.startsWith('2001:db8:')) return true // documentation

  return false
}

export function isBlockedAddress(address: string): boolean {
  if (isIPv4(address)) return isBlockedV4(address)
  if (isIPv6(address)) return isBlockedV6(address)

  // anything that is not an IP literal never reached the resolver
  return true
}

/**
 * Everything that can be judged from the URL text alone, before any DNS lookup.
 * The address check still has to happen per connection, because DNS can change
 * between the check and the connect.
 */
export function checkUrlShape(candidate: string): { url: URL } | { reason: string } {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return { reason: 'is not a URL' }
  }

  if (url.protocol !== 'https:') return { reason: BLOCKED_SCHEME }
  if (url.username !== '' || url.password !== '') return { reason: BLOCKED_CREDENTIALS }
  if (url.port !== '' && url.port !== '443') return { reason: BLOCKED_PORT }

  return { url }
}
