import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FALLBACK_SIGN_IN_ERROR, signInErrorMessage } from '../../../features/auth'
import { SIGN_IN_HEADING, SignInPage } from './sign-in-page'

describe('SignInPage', () => {
  it('offers both providers and never a password field (AUTH-1, AUTH-10)', () => {
    render(<SignInPage />)

    expect(screen.getByRole('heading', { name: SIGN_IN_HEADING })).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-github')).toBeInTheDocument()
    expect(screen.getByTestId('sign-in-google')).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('says nothing alarming when nothing went wrong', () => {
    render(<SignInPage />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('explains a callback failure in a sentence, not a code', () => {
    render(<SignInPage error="AUTH_PROVIDER_EMAIL_UNVERIFIED" />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(signInErrorMessage('AUTH_PROVIDER_EMAIL_UNVERIFIED') as string)
    expect(alert).not.toHaveTextContent('AUTH_')
  })

  it('falls back for a code it has never seen', () => {
    render(<SignInPage error="SOMETHING_NEW" />)

    expect(screen.getByRole('alert')).toHaveTextContent(FALLBACK_SIGN_IN_ERROR)
  })

  it('carries the page the guard was protecting into the provider link', () => {
    render(<SignInPage returnTo="/settings" />)

    expect(screen.getByTestId('sign-in-github')).toHaveAttribute(
      'href',
      '/api/v1/auth/github?returnTo=%2Fsettings',
    )
  })

  it('sends people to the root when there is nowhere in particular to return to', () => {
    render(<SignInPage />)

    expect(screen.getByTestId('sign-in-google')).toHaveAttribute(
      'href',
      '/api/v1/auth/google?returnTo=%2F',
    )
  })
})
