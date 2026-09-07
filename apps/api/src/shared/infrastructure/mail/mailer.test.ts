import { Logger } from '@nestjs/common'
import { ACCOUNT_WELCOME_SUBJECT } from '@repo/email'
import { describe, expect, it, vi } from 'vitest'
import { fakeEnv } from '../../../test-support/fake-env'
import { PermanentJobFailure } from '../../application'
import { ConsoleMailer } from './console-mailer'
import { mailerFor } from './mail.module'
import { RESEND_ENDPOINT, ResendMailer } from './resend-mailer'

const REQUEST = {
  to: 'someone@example.test',
  template: 'account-welcome',
  props: { displayName: 'Haeram', ctaUrl: 'https://vibe-poomat.test/feed' },
} as const

describe('mailerFor', () => {
  it('picks the console driver in development, with no key needed', () => {
    expect(mailerFor(fakeEnv({ MAIL_DRIVER: 'console' }))).toBeInstanceOf(ConsoleMailer)
  })

  it('picks Resend when the driver and the key are both there', () => {
    const mailer = mailerFor(fakeEnv({ MAIL_DRIVER: 'resend', RESEND_API_KEY: 're_test_key' }))

    expect(mailer).toBeInstanceOf(ResendMailer)
  })
})

describe('ConsoleMailer', () => {
  it('renders for real and records what it would have sent', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    const mailer = new ConsoleMailer()

    await mailer.send(REQUEST)

    expect(mailer.outbox()).toHaveLength(1)
    expect(mailer.outbox()[0]).toMatchObject({
      to: REQUEST.to,
      subject: ACCOUNT_WELCOME_SUBJECT,
    })
    expect(mailer.outbox()[0]?.text.toLowerCase()).toContain('haeram')
    vi.restoreAllMocks()
  })
})

describe('ResendMailer', () => {
  function mailer(response: Response) {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => response)
    const subject = new ResendMailer(
      { apiKey: 're_test_key', from: 'no-reply@vibe-poomat.test', fromName: 'vibe poomat' },
      fetchImpl as unknown as typeof globalThis.fetch,
    )

    return { subject, fetchImpl }
  }

  it('posts the rendered message to Resend', async () => {
    const { subject, fetchImpl } = mailer(new Response('{"id":"x"}', { status: 200 }))

    await subject.send(REQUEST)

    expect(fetchImpl).toHaveBeenCalledOnce()
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe(RESEND_ENDPOINT)
    const body = JSON.parse(String(init?.body)) as {
      from: string
      to: string[]
      subject: string
      html: string
      text: string
    }
    expect(body.from).toBe('vibe poomat <no-reply@vibe-poomat.test>')
    expect(body.to).toEqual([REQUEST.to])
    expect(body.subject).toBe(ACCOUNT_WELCOME_SUBJECT)
    expect(body.html).toContain(REQUEST.props.ctaUrl)
    expect(body.text.length).toBeGreaterThan(0)
  })

  it('throws a retriable error when Resend is having a bad day', async () => {
    const { subject } = mailer(new Response('upstream down', { status: 503 }))

    const thrown = await subject.send(REQUEST).catch((error: unknown) => error)

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(PermanentJobFailure)
  })

  it('treats a rejected address as permanent, so it is never retried', async () => {
    const { subject } = mailer(new Response('{"message":"Invalid `to` field"}', { status: 422 }))

    await expect(subject.send(REQUEST)).rejects.toBeInstanceOf(PermanentJobFailure)
  })
})
