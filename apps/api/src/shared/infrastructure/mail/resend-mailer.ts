import { render } from '@repo/email'
import type { Mailer, MailRequest } from '../../application'
import { PermanentJobFailure } from '../../application'

export const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export type ResendConfig = {
  apiKey: string
  from: string
  fromName: string
}

/**
 * Talks to Resend's REST API directly rather than through the SDK, because the
 * retry decision needs the HTTP status: a 4xx means the request itself is wrong
 * (a bad address) and will never succeed, so it must not be retried.
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly config: ResendConfig,
    private readonly fetchImpl: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  async send(request: MailRequest): Promise<void> {
    const { subject, html, text } = await render(request.template, request.props)

    const response = await this.fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: `${this.config.fromName} <${this.config.from}>`,
        to: [request.to],
        subject,
        html,
        text,
      }),
    })

    if (response.ok) return

    const detail = await response.text().catch(() => '')
    const message = `resend rejected the message with ${response.status}: ${detail.slice(0, 200)}`

    // 4xx: the message is wrong, not the moment — retrying cannot help
    if (response.status >= 400 && response.status < 500) {
      throw new PermanentJobFailure(message)
    }

    throw new Error(message)
  }
}
