import { ArrowBigUp } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '../../../shared/lib'

type UpvoteControlProps = ComponentProps<'button'> & {
  count: number
  upvoted: boolean
}

/**
 * The button itself, with no idea what pressing it does. Two things use it: the
 * feature's own upvoting button, and a sign-in dialog trigger for somebody who
 * cannot vote yet — which is why the props pass straight through.
 */
export function UpvoteControl({ count, upvoted, className, ...rest }: UpvoteControlProps) {
  return (
    <button
      type="button"
      aria-pressed={upvoted}
      aria-label={upvoted ? 'Remove your upvote' : 'Upvote'}
      className={cn(
        'flex w-14 flex-col items-center gap-0.5 rounded-md border px-2 py-1 text-sm transition-colors',
        upvoted
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-input text-muted-foreground hover:text-foreground',
        className,
      )}
      {...rest}
    >
      <ArrowBigUp className="size-4" aria-hidden="true" />
      <span className="font-medium tabular-nums">{count}</span>
    </button>
  )
}
