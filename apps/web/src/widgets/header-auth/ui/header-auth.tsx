import { Link } from '@tanstack/react-router'
import { UserAvatar, useCurrentUser } from '../../../entities/session'
import { SignInDialog, useSignOut } from '../../../features/auth'
import { Button } from '../../../shared/ui'

export const SIGN_IN_LABEL = 'Sign in'
export const SIGN_OUT_LABEL = 'Sign out'

/**
 * The header's account corner. It reads the session from the query that SSR
 * already resolved, so it renders the right thing on the first paint rather than
 * flashing "Sign in" at somebody who is signed in.
 */
export function HeaderAuth() {
  const user = useCurrentUser()
  const signOut = useSignOut()

  if (user === null) {
    return (
      <SignInDialog>
        <Button size="sm">{SIGN_IN_LABEL}</Button>
      </SignInDialog>
    )
  }

  return (
    <nav aria-label="Account" className="flex items-center gap-3">
      <Link to="/@{$handle}" params={{ handle: user.handle }} className="flex items-center gap-2">
        <UserAvatar user={user} />
        <span className="hidden font-medium text-sm sm:inline">{user.displayName}</span>
      </Link>
      <Link to="/settings" className="text-muted-foreground text-sm hover:text-foreground">
        Settings
      </Link>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        {SIGN_OUT_LABEL}
      </Button>
    </nav>
  )
}
