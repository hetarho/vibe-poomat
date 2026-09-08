import type { notifications } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { labelFor } from '../../../entities/notification-preference'

export const DONE_HEADING = 'That email is off'
export const FAILED_HEADING = 'That link did not work'
export const OTHERS_UNAFFECTED =
  'Every other kind of email is unchanged. You can turn this one back on in settings whenever you like.'

/**
 * What went wrong, in words, and nothing about whose link it was. The api sends
 * only the code here for exactly that reason: a link forwarded to somebody else
 * must not tell them anything about the account it belonged to.
 */
const REASON: Readonly<Record<string, string>> = {
  UNSUBSCRIBE_TOKEN_NOT_ALLOWED:
    'The link was incomplete or had been changed, so nothing was turned off. Links in older emails also stop working once the signing key is rotated.',
  NOTIFICATION_ALWAYS_ON:
    'That one cannot be turned off — it is the warning that a report on your project is about to decide itself, and that moves your credits.',
}

export const FALLBACK_REASON = 'Nothing was turned off. Try the link again, or use settings.'

type UnsubscribePageProps = {
  /** The single type that was switched off, when one was. */
  type: notifications.NotificationType | null
  /** The api's code, when it refused. */
  error: string | null
}

/**
 * NOTI-4's landing page. It requires no session and reads nothing but the query
 * the api redirected with: the token was verified server-side and never reaches
 * this page, so there is nothing here to leak or to replay.
 */
export function UnsubscribePage({ type, error }: UnsubscribePageProps) {
  const failed = type === null

  return (
    <section className="max-w-xl">
      <h1 className="font-semibold text-2xl tracking-tight">
        {failed ? FAILED_HEADING : DONE_HEADING}
      </h1>

      {failed ? (
        <p className="mt-3 text-muted-foreground">
          {error === null ? FALLBACK_REASON : (REASON[error] ?? FALLBACK_REASON)}
        </p>
      ) : (
        <>
          <p className="mt-3">
            You will no longer be emailed when:{' '}
            <span className="font-medium">{labelFor(type)}</span>.
          </p>
          <p className="mt-3 text-muted-foreground">{OTHERS_UNAFFECTED}</p>
        </>
      )}

      <Link to="/settings" className="mt-6 inline-block underline underline-offset-4">
        Notification settings
      </Link>
    </section>
  )
}
