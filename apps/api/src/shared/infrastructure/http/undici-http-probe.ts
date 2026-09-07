import { Injectable } from '@nestjs/common'
import type { Dispatcher } from 'undici'
import { request } from 'undici'
import type { HttpProbe, ProbeResult } from '../../application'
import { UrlUnreachableError } from '../../application'
import { err, ok, type Result } from '../../result'
import { checkUrlShape } from './address-guard'
import { createSsrfAgent } from './ssrf-agent'

export const MAX_REDIRECTS = 3
export const PROBE_TIMEOUT_MS = 5_000
export const MAX_BODY_BYTES = 64 * 1024

export type HttpProbeOptions = {
  dispatcher?: Dispatcher
  /** https only in production; a test may allow http to reach a local server. */
  allowedProtocols?: readonly string[]
  maxRedirects?: number
  timeoutMs?: number
  maxBodyBytes?: number
}

const METHOD_NOT_ALLOWED = new Set([405, 501])

@Injectable()
export class UndiciHttpProbe implements HttpProbe {
  private readonly dispatcher: Dispatcher
  private readonly allowedProtocols: readonly string[]
  private readonly maxRedirects: number
  private readonly timeoutMs: number
  private readonly maxBodyBytes: number

  constructor(options: HttpProbeOptions = {}) {
    this.dispatcher = options.dispatcher ?? createSsrfAgent()
    this.allowedProtocols = options.allowedProtocols ?? ['https:']
    this.maxRedirects = options.maxRedirects ?? MAX_REDIRECTS
    this.timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS
    this.maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES
  }

  async probe(candidate: string): Promise<Result<ProbeResult, UrlUnreachableError>> {
    const deadline = AbortSignal.timeout(this.timeoutMs)
    let current = candidate

    for (let hop = 0; hop <= this.maxRedirects; hop += 1) {
      const shape = this.checkShape(current)
      if ('reason' in shape) return err(new UrlUnreachableError(`${current} ${shape.reason}`))

      let response: Dispatcher.ResponseData
      try {
        response = await this.fetchOnce(shape.url, deadline)
      } catch (error) {
        return err(
          new UrlUnreachableError(
            `${current} could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`,
          ),
        )
      }

      await this.drain(response)

      const location = response.headers.location
      const isRedirect = response.statusCode >= 300 && response.statusCode < 400
      if (!isRedirect || typeof location !== 'string') {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          return ok({ finalUrl: shape.url.toString(), status: response.statusCode })
        }

        return err(
          new UrlUnreachableError(`${current} answered ${response.statusCode}`, {
            status: response.statusCode,
          }),
        )
      }

      // each hop is re-checked from the top of this loop, shape and address alike
      current = new URL(location, shape.url).toString()
    }

    return err(
      new UrlUnreachableError(`${candidate} redirected more than ${this.maxRedirects} times`),
    )
  }

  private checkShape(candidate: string): { url: URL } | { reason: string } {
    const shape = checkUrlShape(candidate)
    if ('url' in shape) return shape
    if (this.allowedProtocols.includes('https:')) return shape

    // a test-only relaxation: judge the protocol against the allowed list
    try {
      const url = new URL(candidate)
      if (!this.allowedProtocols.includes(url.protocol)) return { reason: shape.reason }
      if (url.username !== '' || url.password !== '') return { reason: shape.reason }

      return { url }
    } catch {
      return { reason: 'is not a URL' }
    }
  }

  private async fetchOnce(url: URL, signal: AbortSignal): Promise<Dispatcher.ResponseData> {
    const head = await request(url, {
      method: 'HEAD',
      dispatcher: this.dispatcher,
      // undici does not follow redirects unless asked; this walks them itself so
      // every hop goes back through the shape and address checks
      signal,
    })
    if (!METHOD_NOT_ALLOWED.has(head.statusCode)) return head

    // some hosts refuse HEAD; a ranged GET asks for as little as possible
    await this.drain(head)

    return request(url, {
      method: 'GET',
      dispatcher: this.dispatcher,
      headers: { range: `bytes=0-${this.maxBodyBytes - 1}` },
      signal,
    })
  }

  /** Reads at most the cap and throws the bytes away; nothing here needs a body. */
  private async drain(response: Dispatcher.ResponseData): Promise<void> {
    let read = 0
    try {
      for await (const chunk of response.body) {
        read += (chunk as Buffer).length
        if (read >= this.maxBodyBytes) break
      }
    } catch {
      // a body that fails midway is still a body we do not need
    } finally {
      response.body.destroy()
    }
  }
}
