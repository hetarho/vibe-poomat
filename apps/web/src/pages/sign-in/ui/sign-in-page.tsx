import {
  ProviderButtons,
  SIGN_IN_DESCRIPTION,
  SIGN_IN_TITLE,
  SignInError,
} from '../../../features/auth'

export const SIGN_IN_HEADING = SIGN_IN_TITLE

type SignInPageProps = {
  /** The callback's `?error=`, when it sent one back (T018). */
  error?: string
  /** Where to go once it works; the guard puts the page you wanted here. */
  returnTo?: string
}

/**
 * Where a failed sign-in lands, and where the route guard sends a signed-out
 * person. The ordinary way in is the dialog, which keeps `returnTo` pointing at
 * the page somebody was actually on — this page exists for the two cases where
 * there is no such page.
 */
export function SignInPage({ error, returnTo }: SignInPageProps) {
  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">{SIGN_IN_HEADING}</h1>
        <p className="mt-2 text-muted-foreground text-sm">{SIGN_IN_DESCRIPTION}</p>
      </div>
      <SignInError code={error} />
      <ProviderButtons returnTo={returnTo ?? null} />
    </section>
  )
}
