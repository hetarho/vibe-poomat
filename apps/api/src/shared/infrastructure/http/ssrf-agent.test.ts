import type { LookupAllOptions } from 'node:dns'
import { describe, expect, it, vi } from 'vitest'
import { BLOCKED_ADDRESS } from './address-guard'
import { createSsrfConnector, type LookupFn } from './ssrf-agent'

/** A resolver that answers from a table, so no test touches real DNS. */
function stubLookup(byHost: Record<string, string[]>): LookupFn {
  return ((
    hostname: string,
    _options: LookupAllOptions,
    callback: (error: Error | null, addresses: { address: string; family: number }[]) => void,
  ) => {
    const addresses = byHost[hostname]
    if (addresses === undefined) {
      callback(new Error(`no such host: ${hostname}`), [])

      return
    }
    callback(
      null,
      addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
    )
  }) as unknown as LookupFn
}

function connectTo(host: string, byHost: Record<string, string[]>): Promise<Error | null> {
  const connector = createSsrfConnector({ lookup: stubLookup(byHost) })

  return new Promise((resolve) => {
    // the callback is a union of (error, null) and (null, socket), so its
    // parameters are read as a tuple; only the rejection branch matters here
    connector({ hostname: host, host, port: '443', protocol: 'https:' }, (...args) => {
      resolve(args[0])
    })
  })
}

describe('the SSRF connector', () => {
  it.each([
    ['a host that resolves to loopback', ['127.0.0.1']],
    ['a host that resolves to a private address', ['10.0.0.7']],
    ['a host that resolves to the metadata service', ['169.254.169.254']],
    ['a host that resolves to IPv6 loopback', ['::1']],
    ['a host that resolves to an IPv4-mapped loopback', ['::ffff:127.0.0.1']],
    ['a host with one public and one private answer', ['93.184.216.34', '10.0.0.7']],
  ])('refuses %s', async (_label, addresses) => {
    const error = await connectTo('sneaky.test', { 'sneaky.test': addresses })

    expect(error?.message).toContain(BLOCKED_ADDRESS)
  })

  it('refuses a host that resolves to nothing', async () => {
    const error = await connectTo('empty.test', { 'empty.test': [] })

    expect(error?.message).toContain(BLOCKED_ADDRESS)
  })

  it('passes a resolution failure through as it is', async () => {
    const error = await connectTo('missing.test', {})

    expect(error?.message).toContain('no such host')
  })

  it('checks every connection, which is what makes a redirect safe', async () => {
    const lookup = vi.fn(stubLookup({ 'public.test': ['93.184.216.34'] }))
    const connector = createSsrfConnector({ lookup: lookup as unknown as LookupFn })

    for (const _hop of [1, 2, 3]) {
      await new Promise<void>((resolve) => {
        connector(
          { hostname: 'public.test', host: 'public.test', port: '443', protocol: 'https:' },
          () => {
            resolve()
          },
        )
        // a real connect may never call back here; the lookup is what this
        // asserts, and it has already happened by the time this fires
        setTimeout(resolve, 50)
      })
    }

    expect(lookup).toHaveBeenCalledTimes(3)
  })
})
