import { useToggleUpvote } from '../model/use-toggle-upvote'
import { UpvoteControl } from './upvote-control'

type UpvoteButtonProps = {
  projectId: string
  count: number
  upvoted: boolean
}

/**
 * For a signed-in reader who is not the owner. PROJ-11 forbids voting on your
 * own project, and that is the caller's decision to make: it has the owner id
 * and this does not.
 */
export function UpvoteButton({ projectId, count, upvoted }: UpvoteButtonProps) {
  const toggle = useToggleUpvote(projectId)

  return (
    <UpvoteControl
      count={count}
      upvoted={upvoted}
      // not disabled while in flight: the optimistic value has already moved,
      // and a disabled control would say the press had not registered
      onClick={() => toggle.mutate()}
    />
  )
}
