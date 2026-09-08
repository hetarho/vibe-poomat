import { cn } from '../../../shared/lib'
import type { CurrentUser } from '../model/session.query'

type UserAvatarProps = {
  user: Pick<CurrentUser, 'displayName' | 'avatarUrl'>
  className?: string
}

/**
 * The provider's picture when there is one, and the first letter when there is
 * not — an account is never without a display name, so there is always
 * something to draw and never a broken image.
 */
export function UserAvatar({ user, className }: UserAvatarProps) {
  const initial = user.displayName.trim().charAt(0).toUpperCase() || '?'

  return user.avatarUrl === null ? (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 items-center justify-center rounded-full bg-muted font-medium text-sm',
        className,
      )}
    >
      {initial}
    </span>
  ) : (
    <img
      src={user.avatarUrl}
      alt=""
      className={cn('size-8 rounded-full object-cover', className)}
      referrerPolicy="no-referrer"
    />
  )
}
