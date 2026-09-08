import { signInErrorMessage } from '../lib/callback-error'

type SignInErrorProps = {
  /** The `?error=` the callback redirected with, if any. */
  code: string | null | undefined
}

/** Nothing at all when the sign-in went fine, which is the usual case. */
export function SignInError({ code }: SignInErrorProps) {
  const message = signInErrorMessage(code)
  if (message === null) return null

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
    >
      {message}
    </p>
  )
}
