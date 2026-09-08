import { useRouterState } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../shared/ui'
import { ProviderButtons } from './provider-buttons'

export const SIGN_IN_TITLE = 'Sign in'
export const SIGN_IN_DESCRIPTION =
  'One account, both ways in. We only ever see what the provider tells us.'

type SignInDialogProps = {
  children: ReactNode
  /** Overrides where sign-in returns to; defaults to the page you are on. */
  returnTo?: string
}

/**
 * A dialog rather than a route, so `returnTo` is always the page somebody was
 * actually looking at when they decided to sign in.
 */
export function SignInDialog({ children, returnTo }: SignInDialogProps) {
  const here = useRouterState({
    select: (state) => `${state.location.pathname}${state.location.searchStr}`,
  })

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{SIGN_IN_TITLE}</DialogTitle>
          <DialogDescription>{SIGN_IN_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <ProviderButtons returnTo={returnTo ?? here} />
      </DialogContent>
    </Dialog>
  )
}
