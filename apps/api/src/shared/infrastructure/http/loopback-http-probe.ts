import type { HttpProbe, ProbeResult } from '../../application'
import { UrlUnreachableError } from '../../application'
import { err, ok, type Result } from '../../result'

/** The suffix a fixture URL carries, which no real domain can hold (RFC 6761). */
export const REACHABLE_TEST_SUFFIX = '.test'

/**
 * The probe used when `NODE_ENV=test`, chosen by env like the mailer (ARCH-36)
 * rather than by an `if` inside a use case.
 *
 * PROJ-2 makes project creation depend on a URL that answers, and ARCH-40's
 * SSRF guard refuses loopback on purpose — so a browser suite cannot point at a
 * fixture server on localhost, and pointing at the public internet would make
 * the suite depend on somebody else's uptime. This answers for `.test` hosts,
 * which are reserved and can never resolve, and refuses everything else so the
 * unreachable branch stays testable too.
 */
export class LoopbackHttpProbe implements HttpProbe {
  async probe(candidate: string): Promise<Result<ProbeResult, UrlUnreachableError>> {
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      return err(new UrlUnreachableError(`${candidate} is not a URL`))
    }

    if (url.protocol !== 'https:') {
      return err(new UrlUnreachableError(`${candidate} is not https`))
    }
    if (!url.hostname.endsWith(REACHABLE_TEST_SUFFIX)) {
      return err(
        new UrlUnreachableError(`${candidate} answered 502`, { status: 502, url: candidate }),
      )
    }

    return ok({ finalUrl: url.toString(), status: 200 })
  }
}
