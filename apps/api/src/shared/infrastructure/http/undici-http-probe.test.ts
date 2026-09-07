import { createServer, type Server } from 'node:http'
import { Agent } from 'undici'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { UndiciHttpProbe } from './undici-http-probe'

/**
 * A local server, reached with the guard's protocol rule relaxed to http, so the
 * timeout and body-cap behaviour can be driven for real without a live network.
 */
let server: Server
let origin = ''

function probe(overrides: Partial<ConstructorParameters<typeof UndiciHttpProbe>[0]> = {}) {
  return new UndiciHttpProbe({
    dispatcher: new Agent(),
    allowedProtocols: ['http:'],
    ...overrides,
  })
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = request.url ?? '/'

    if (path === '/ok') {
      response.writeHead(200).end()
    } else if (path === '/no-head') {
      if (request.method === 'HEAD') response.writeHead(405).end()
      else response.writeHead(200, { 'content-type': 'text/html' }).end('<html></html>')
    } else if (path === '/gone') {
      response.writeHead(404).end()
    } else if (path.startsWith('/redirect/')) {
      const hop = Number(path.slice('/redirect/'.length))
      response.writeHead(302, { location: hop <= 1 ? '/ok' : `/redirect/${hop - 1}` }).end()
    } else if (path === '/redirect-to-loopback') {
      response.writeHead(302, { location: 'http://127.0.0.1:9/nope' }).end()
    } else if (path === '/stall') {
      // never answers
    } else if (path === '/forever') {
      // refuses HEAD so the probe falls back to a GET and meets the stream
      if (request.method === 'HEAD') {
        response.writeHead(405).end()

        return
      }
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      const push = () => {
        if (response.writableEnded) return
        response.write(Buffer.alloc(8 * 1024, 0x61))
        setTimeout(push, 1)
      }
      push()
    } else {
      response.writeHead(418).end()
    }
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  origin = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : ''
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('UndiciHttpProbe', () => {
  it('reports a reachable URL with its status', async () => {
    const result = await probe().probe(`${origin}/ok`)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({ finalUrl: `${origin}/ok`, status: 200 })
  })

  it('falls back to a ranged GET when HEAD is refused', async () => {
    const result = await probe().probe(`${origin}/no-head`)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().status).toBe(200)
  })

  it('follows redirects and reports where they ended', async () => {
    const result = await probe().probe(`${origin}/redirect/2`)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().finalUrl).toBe(`${origin}/ok`)
  })

  it('gives up after too many redirects', async () => {
    const result = await probe({ maxRedirects: 2 }).probe(`${origin}/redirect/9`)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().message).toContain('redirected more than 2 times')
  })

  it('reports a 404 as unreachable, with the status it saw', async () => {
    const result = await probe().probe(`${origin}/gone`)

    expect(result._unsafeUnwrapErr().code).toBe('URL_UNREACHABLE')
    expect(result._unsafeUnwrapErr().details).toEqual({ status: 404 })
  })

  it('gives up on a host that never answers', async () => {
    const result = await probe({ timeoutMs: 400 }).probe(`${origin}/stall`)

    expect(result.isErr()).toBe(true)
    expect(result._unsafeUnwrapErr().code).toBe('URL_UNREACHABLE')
  })

  it('stops reading a body that streams forever, well inside the timeout', async () => {
    const startedAt = Date.now()
    const result = await probe({ maxBodyBytes: 16 * 1024, timeoutMs: 4_000 }).probe(
      `${origin}/forever`,
    )

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap().status).toBe(200)
    // without the cap this would run until the timeout aborted it
    expect(Date.now() - startedAt).toBeLessThan(3_000)
  })

  it('still refuses a URL that is not allowed, before any request', async () => {
    const result = await probe().probe('https://user:pw@example.test')

    expect(result._unsafeUnwrapErr().message).toContain('credentials')
  })

  it('refuses a plain http URL under the production protocol rule', async () => {
    const result = await new UndiciHttpProbe({ dispatcher: new Agent() }).probe(`${origin}/ok`)

    expect(result._unsafeUnwrapErr().message).toContain('https')
  })
})
