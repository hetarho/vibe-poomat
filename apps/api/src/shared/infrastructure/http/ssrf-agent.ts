import { lookup as dnsLookup } from 'node:dns'
import { Agent, buildConnector } from 'undici'
import { BLOCKED_ADDRESS, isBlockedAddress } from './address-guard'

export type LookupFn = typeof dnsLookup

export type SsrfAgentOptions = {
  connectTimeoutMs?: number
  /** Injectable so the tests need no live DNS. */
  lookup?: LookupFn
}

/**
 * The guard has to live in the connector, not in a pre-flight lookup: undici
 * connects once per redirect hop, so this is the only place that sees every
 * destination. Checking only the first URL is the classic SSRF bypass.
 */
export function createSsrfConnector(options: SsrfAgentOptions = {}): buildConnector.connector {
  const connect = buildConnector({ timeout: options.connectTimeoutMs ?? 5_000 })
  const lookup = options.lookup ?? dnsLookup

  return (connectOptions, callback) => {
    const hostname = connectOptions.hostname.replace(/^\[|\]$/g, '')

    lookup(hostname, { all: true }, (error, addresses) => {
      if (error !== null) {
        callback(error, null)

        return
      }

      const resolved = addresses.map((entry) => entry.address)
      if (resolved.length === 0 || resolved.some(isBlockedAddress)) {
        callback(new Error(`${hostname} ${BLOCKED_ADDRESS}`), null)

        return
      }

      // connect to the address that was actually checked, keeping the original
      // hostname for TLS, so no second resolution can slip a different IP in
      connect(
        {
          ...connectOptions,
          hostname: resolved[0] ?? hostname,
          servername: connectOptions.servername ?? hostname,
        },
        callback,
      )
    })
  }
}

export function createSsrfAgent(options: SsrfAgentOptions = {}): Agent {
  return new Agent({ connect: createSsrfConnector(options) })
}
