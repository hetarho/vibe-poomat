import { describe, expect, it } from 'vitest'
import { NO_REPLY_NOTICE } from './layout'
import type { EmailTemplateName, EmailTemplateProps } from './render'
import { render } from './render'

const CTA_URL = 'https://vibe-poomat.test/feedbacks/0192a1b2-c3d4-7000-8000-0123456789ab'
const UNSUBSCRIBE_URL =
  'https://api.vibe-poomat.test/api/v1/notifications/unsubscribe?token=abc.def'
const SETTINGS_URL = 'https://vibe-poomat.test/settings/notifications'

const shared = {
  displayName: 'Haeram',
  ctaUrl: CTA_URL,
  unsubscribeUrl: UNSUBSCRIBE_URL,
  settingsUrl: SETTINGS_URL,
}

/** Every NOTI-2 type with props good enough to render it. */
const CASES = [
  ['feedback_received', shared],
  ['thread_reply', shared],
  ['feedback_accepted', shared],
  ['feedback_rejected', { ...shared, reason: 'no_substance' }],
  ['auto_accepted', { ...shared, role: 'feedbacker' }],
  ['mission_ended', { ...shared, ending: 'expired', refundedSlots: 2 }],
] as const satisfies readonly (readonly [EmailTemplateName, unknown])[]

async function renderOne<TName extends EmailTemplateName>(
  name: TName,
  props: EmailTemplateProps[TName],
) {
  return render(name, props)
}

describe('the NOTI-2 notification templates', () => {
  describe.each(CASES)('%s', (name, props) => {
    it('has a subject worth reading in a list of unread mail', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.subject.length).toBeGreaterThan(10)
      expect(email.subject).not.toContain('undefined')
    })

    it('greets the recipient by name', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.html).toContain('Haeram')
    })

    /** NOTI-4: the deep link is the whole point of sending the email. */
    it('carries the deep link as its primary action', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.html).toContain(CTA_URL)
      expect(email.text).toContain(CTA_URL)
    })

    it('carries the per-type unsubscribe link and the settings link', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.html).toContain(UNSUBSCRIBE_URL)
      expect(email.html).toContain(SETTINGS_URL)
    })

    /** NOTI-5: the mailbox does not accept replies and the body has to say so. */
    it('says that replies are not accepted', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.html).toContain(NO_REPLY_NOTICE)
      expect(email.text).toContain(NO_REPLY_NOTICE)
    })

    it('leaves no template placeholder or stray tag in the text fallback', async () => {
      const email = await renderOne(name, props as EmailTemplateProps[typeof name])

      expect(email.text).not.toContain('undefined')
      expect(email.text).not.toContain('[object Object]')
      expect(email.text).not.toContain('<html')
    })
  })

  describe('auto_accept_warning, the one NOTI-3 will not let anybody switch off', () => {
    const props = { ...shared, unsubscribeUrl: null }

    it('carries no unsubscribe link at all', async () => {
      const email = await render('auto_accept_warning', props)

      expect(email.html).not.toContain(UNSUBSCRIBE_URL)
    })

    it('says why, and still offers the settings page', async () => {
      const email = await render('auto_accept_warning', props)

      expect(email.text).toContain('cannot be turned off')
      expect(email.html).toContain(SETTINGS_URL)
    })

    it('still deep-links to the decision that is about to be made', async () => {
      const email = await render('auto_accept_warning', props)

      expect(email.html).toContain(CTA_URL)
    })
  })

  describe('the copy that changes with the data', () => {
    it.each([
      ['task_not_done', 'the task was not actually done'],
      ['no_substance', 'nothing to act on'],
      ['spam_abuse', 'spam or abuse'],
    ] as const)('says what %s means, in a sentence', async (reason, phrase) => {
      const email = await render('feedback_rejected', { ...shared, reason })

      expect(email.text).toContain(phrase)
    })

    it('omits the reason clause entirely when there is none', async () => {
      const email = await render('feedback_rejected', { ...shared, reason: null })

      expect(email.text).toContain('rejected the report you wrote')
      expect(email.text).not.toContain('saying that')
    })

    it('writes the maker and the feedbacker different sentences', async () => {
      const maker = await render('auto_accepted', { ...shared, role: 'maker' })
      const feedbacker = await render('auto_accepted', { ...shared, role: 'feedbacker' })

      expect(maker.text).toContain('A report on your project')
      expect(feedbacker.text).toContain('added to your balance')
    })

    it.each([
      [0, 'No slots went unfilled'],
      [1, '1 unfilled slot was refunded'],
      [3, '3 unfilled slots were refunded'],
    ])('counts %i refunded slots in words that agree', async (refundedSlots, phrase) => {
      const email = await render('mission_ended', { ...shared, ending: 'closed', refundedSlots })

      expect(email.text).toContain(phrase)
    })

    it.each([
      ['completed', 'every slot was filled and settled'],
      ['expired', 'ran to the end of its window'],
      ['closed', 'you closed it'],
    ] as const)('says why a %s mission ended', async (ending, phrase) => {
      const email = await render('mission_ended', { ...shared, ending, refundedSlots: 0 })

      expect(email.text).toContain(phrase)
    })
  })
})
