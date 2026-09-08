import { notifications } from '@repo/contracts'
import { createFileRoute } from '@tanstack/react-router'
import { UnsubscribePage } from '../../src/pages/unsubscribe'

type UnsubscribeSearch = {
  type?: notifications.NotificationType
  error?: string
}

function parseType(value: unknown): notifications.NotificationType | undefined {
  return notifications.NOTIFICATION_TYPES.includes(value as notifications.NotificationType)
    ? (value as notifications.NotificationType)
    : undefined
}

/**
 * NOTI-4's landing page, and deliberately not behind the session guard: the
 * click comes from a mail client, which has no cookie for this site and should
 * not need one. The api verified the token and did the work before redirecting
 * here, so this page renders an outcome and holds no authority of its own.
 */
export const Route = createFileRoute('/unsubscribe')({
  validateSearch: (search: Record<string, unknown>): UnsubscribeSearch => {
    const type = parseType(search.type)
    if (type !== undefined) return { type }

    // only the api's own codes are echoed, so a crafted URL cannot put text on
    // the page; anything else falls through to the generic failure
    return typeof search.error === 'string' && search.error.length <= 64
      ? { error: search.error }
      : {}
  },
  component: UnsubscribeRoute,
})

function UnsubscribeRoute() {
  const { type, error } = Route.useSearch()

  return <UnsubscribePage type={type ?? null} error={error ?? null} />
}
