import { describe, expect, it } from 'vitest'
import { NO_REPLY_NOTICE } from './layout'
import { render, templateNames } from './render'
import { ACCOUNT_WELCOME_SUBJECT } from './templates/account-welcome'

const CTA_URL = 'https://vibe-poomat.test/feed'

describe('render', () => {
  it('produces a subject, HTML and a plain-text fallback', async () => {
    const email = await render('account-welcome', { displayName: 'Haeram', ctaUrl: CTA_URL })

    expect(email.subject).toBe(ACCOUNT_WELCOME_SUBJECT)
    expect(email.html).toContain('<html')
    expect(email.text.length).toBeGreaterThan(0)
  })

  it('puts the recipient name and the CTA link in the HTML', async () => {
    const email = await render('account-welcome', { displayName: 'Haeram', ctaUrl: CTA_URL })

    expect(email.html).toContain('Haeram')
    expect(email.html).toContain(CTA_URL)
  })

  it('carries the no-reply notice, in both HTML and text', async () => {
    const email = await render('account-welcome', { displayName: 'Haeram', ctaUrl: CTA_URL })

    expect(email.html).toContain(NO_REPLY_NOTICE)
    expect(email.text).toContain(NO_REPLY_NOTICE)
  })

  it('derives the text fallback from the rendered HTML, with no tags left', async () => {
    const email = await render('account-welcome', { displayName: 'Haeram', ctaUrl: CTA_URL })

    // the converter upper-cases headings, so the name is matched case-insensitively
    expect(email.text.toLowerCase()).toContain('haeram')
    expect(email.text).toContain(CTA_URL)
    expect(email.text).not.toContain('<html')
    expect(email.text).not.toContain('<td')
  })

  it('knows exactly which templates exist', () => {
    expect(templateNames()).toEqual(['account-welcome'])
  })
})
