import { type FormEvent, useState } from 'react'
import { errorMessage } from '../../../shared/api'
import { Button, Input } from '../../../shared/ui'
import { DELETION_CONSEQUENCES } from '../lib/consequences'
import { useDeleteAccount } from '../model/use-delete-account'

export const DELETE_HEADING = 'Delete your account'

type DeleteAccountSectionProps = {
  handle: string
  /** Where to send the browser once the account is gone. */
  onDeleted: () => void
}

/**
 * AUTH-9, with its consequences listed before the field rather than behind a
 * confirmation afterwards. Typing the handle is the confirmation the server also
 * demands — the button stays disabled until it matches exactly.
 */
export function DeleteAccountSection({ handle, onDeleted }: DeleteAccountSectionProps) {
  const [confirm, setConfirm] = useState('')
  const remove = useDeleteAccount()

  const matches = confirm.trim() === handle

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (!matches) return

    remove.mutate(confirm.trim(), { onSuccess: onDeleted })
  }

  return (
    <section aria-label={DELETE_HEADING} className="rounded-md border border-destructive/40 p-4">
      <h2 className="font-semibold text-destructive">{DELETE_HEADING}</h2>
      <ul className="mt-3 list-disc pl-5 text-sm">
        {DELETION_CONSEQUENCES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="confirm-handle">
          Type <span className="font-mono">{handle}</span> to confirm
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="confirm-handle"
            value={confirm}
            autoComplete="off"
            onChange={(event) => setConfirm(event.target.value)}
          />
          <Button type="submit" variant="destructive" disabled={!matches || remove.isPending}>
            {remove.isPending ? 'Deleting…' : 'Delete account'}
          </Button>
        </div>
        {remove.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(remove.error)}
          </p>
        ) : null}
      </form>
    </section>
  )
}
