import type { notifications } from '@repo/contracts'
import { errorMessage } from '../../../shared/api'
import {
  useNotificationPreferences,
  useSetNotificationPreference,
} from '../model/use-notification-preferences'

/** NOTI-2's seven types, said the way somebody reading settings would say them. */
const LABELS: Record<notifications.NotificationType, string> = {
  feedback_received: 'Somebody left feedback on my project',
  thread_reply: 'Somebody replied in a thread I am in',
  feedback_accepted: 'My feedback was accepted',
  feedback_rejected: 'My feedback was rejected',
  auto_accept_warning: 'A report on my project auto-accepts in 24 hours',
  auto_accepted: 'A report was accepted automatically',
  mission_ended: 'My mission ended',
}

export const ALWAYS_ON_NOTE = 'Always on — it moves credits.'

/**
 * NOTI-3. The auto-accept warning is shown switched on and disabled rather than
 * hidden: somebody looking for it should find out that it cannot be turned off,
 * not be left wondering where it went.
 */
export function NotificationToggles() {
  const preferences = useNotificationPreferences()
  const change = useSetNotificationPreference()

  if (preferences.isPending) {
    return <p className="text-muted-foreground text-sm">Loading your notification settings…</p>
  }
  if (preferences.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {errorMessage(preferences.error)}
      </p>
    )
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-label="Notifications">
      {(preferences.data?.items ?? []).map((item) => (
        <label key={item.type} className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={item.enabled}
            disabled={!item.canDisable || change.isPending}
            onChange={(event) => change.mutate({ [item.type]: event.target.checked })}
          />
          <span>
            {LABELS[item.type]}
            {item.canDisable ? null : (
              <span className="block text-muted-foreground text-xs">{ALWAYS_ON_NOTE}</span>
            )}
          </span>
        </label>
      ))}
      {change.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(change.error)}
        </p>
      ) : null}
    </fieldset>
  )
}
