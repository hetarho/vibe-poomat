import { type FormEvent, useState } from 'react'
import { ApiError, errorMessage } from '../../../shared/api'
import { Button, Input } from '../../../shared/ui'
import { HANDLE_MAX_LENGTH, handleProblem } from '../lib/handle-rules'
import { useChangeHandle } from '../model/use-change-handle'

export const HANDLE_WARNING =
  'Changing this releases your old handle immediately. Anyone can take it, and links to it stop working.'

type HandleFormProps = {
  handle: string
}

/**
 * AUTH-6. The consequence is stated beside the field rather than in a
 * confirmation afterwards, because it is irreversible the instant it succeeds.
 */
export function HandleForm({ handle }: HandleFormProps) {
  const [value, setValue] = useState(handle)
  const change = useChangeHandle()

  const local = handleProblem(value)
  const taken = change.error instanceof ApiError && change.error.code === 'AUTH_HANDLE_TAKEN'
  const problem =
    local ??
    (taken
      ? 'Somebody already holds that handle.'
      : change.error === null
        ? null
        : errorMessage(change.error))
  const unchanged = value.trim() === handle

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (local !== null || unchanged) return

    change.mutate(value.trim())
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Handle">
      <label className="font-medium text-sm" htmlFor="handle">
        Handle
      </label>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">@</span>
        <Input
          id="handle"
          value={value}
          maxLength={HANDLE_MAX_LENGTH}
          onChange={(event) => setValue(event.target.value.toLowerCase())}
          aria-invalid={problem !== null}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={local !== null || unchanged || change.isPending}
        >
          {change.isPending ? 'Changing…' : 'Change'}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{HANDLE_WARNING}</p>
      {problem === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {problem}
        </p>
      )}
      {change.isSuccess ? (
        <p className="text-muted-foreground text-sm">
          You are now <span className="font-mono">@{change.data.handle}</span>.
        </p>
      ) : null}
    </form>
  )
}
