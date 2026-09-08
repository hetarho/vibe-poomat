import { useQuery } from '@tanstack/react-query'
import {
  ALWAYS_ON_NOTE,
  labelFor,
  notificationPreferencesQueryOptions,
} from '../../../entities/notification-preference'
import { errorMessage } from '../../../shared/api'
import { useSetNotificationPreference } from '../model/use-set-preference'

/**
 * NOTI-3. The auto-accept warning is shown switched on and disabled rather than
 * hidden: somebody looking for it should find out that it cannot be turned off,
 * not be left wondering where it went.
 */
export function NotificationToggles() {
  const preferences = useQuery(notificationPreferencesQueryOptions())
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
            // saved one at a time, so the others stay usable while this one is
            // in flight — the row itself has already moved
            disabled={!item.canDisable}
            onChange={(event) => change.mutate({ type: item.type, enabled: event.target.checked })}
          />
          <span>
            {labelFor(item.type)}
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
