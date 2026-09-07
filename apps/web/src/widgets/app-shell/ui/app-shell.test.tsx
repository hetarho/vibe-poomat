import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppShell, PRODUCT_NAME } from './app-shell'

describe('AppShell', () => {
  it('frames the page with a header, a main region and a footer', () => {
    render(<AppShell>page body</AppShell>)

    expect(screen.getByRole('banner')).toHaveTextContent(PRODUCT_NAME)
    expect(screen.getByRole('main')).toHaveTextContent('page body')
    expect(screen.getByRole('contentinfo')).toHaveTextContent(PRODUCT_NAME)
  })

  it('leaves the auth slot empty until the AUTH tasks fill it', () => {
    render(<AppShell>body</AppShell>)

    expect(screen.getByTestId('auth-slot')).toBeEmptyDOMElement()
  })

  it('renders whatever is put in the auth slot', () => {
    render(<AppShell authSlot={<button type="button">Sign in</button>}>body</AppShell>)

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })
})
