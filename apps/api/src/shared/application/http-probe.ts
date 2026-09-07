import type { Result } from '../result'
import { ValidationError } from '../result'

export const HTTP_PROBE = Symbol('HTTP_PROBE')

export type ProbeResult = {
  /** Where the redirects ended up, which may differ from what was asked for. */
  finalUrl: string
  status: number
}

/** A user-supplied URL that could not be reached, or was never allowed to be. */
export class UrlUnreachableError extends ValidationError {
  override readonly code = 'URL_UNREACHABLE'
}

/**
 * Verifies a URL a person typed (ARCH-40). Every implementation must refuse to
 * reach anything that is not a public host, on every redirect hop.
 */
export type HttpProbe = {
  probe(url: string): Promise<Result<ProbeResult, UrlUnreachableError>>
}
