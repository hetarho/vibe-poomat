import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell } from './app-shell'

/**
 * NOTI-7 rejected an in-app inbox and a bell. This guards the shell every page
 * renders inside: email is the only channel, so nothing here may suggest there
 * is a second one waiting to be read.
 */
describe('NOTI-7: no in-app notification surface', () => {
  it('renders no bell or notification control in the shell', () => {
    render(
      <AppShell authSlot={<span>account</span>}>
        <p>page</p>
      </AppShell>,
    )

    for (const pattern of [/notification/i, /\bbell\b/i, /unread/i, /alerts?/i]) {
      expect(screen.queryByRole('button', { name: pattern })).toBeNull()
      expect(screen.queryByRole('link', { name: pattern })).toBeNull()
      expect(screen.queryByLabelText(pattern)).toBeNull()
    }
  })

  it('shows no badge or count anywhere in the shell', () => {
    const { container } = render(
      <AppShell authSlot={<span>account</span>}>
        <p>page</p>
      </AppShell>,
    )

    expect(container.querySelector('[data-notification-count]')).toBeNull()
    expect(container.textContent).not.toMatch(/notification/i)
  })
})
