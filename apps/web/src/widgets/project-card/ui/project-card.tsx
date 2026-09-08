import type { projects } from '@repo/contracts'
import { Link } from '@tanstack/react-router'
import { useCurrentUser } from '../../../entities/session'
import { SignInDialog } from '../../../features/auth'
import { UpvoteButton, UpvoteControl } from '../../../features/upvote-project'
import { UserAvatar } from '../../../shared/ui'

type ProjectCardProps = {
  card: projects.FeedCard
}

/** PROJ-9's reason for the ordering, said on the card that benefits from it. */
function slotBadge(claimable: number): string {
  return claimable === 1 ? '1 slot open' : `${claimable} slots open`
}

/**
 * One card, used by the default feed, the popular tab and anywhere else a
 * project is listed — so a change to the ranking can never fork the markup.
 *
 * PROJ-11 decides the upvote control three ways: the owner gets nothing at all
 * rather than something disabled, a signed-out reader gets a control that opens
 * sign-in, and everybody else gets the real thing.
 */
export function ProjectCard({ card }: ProjectCardProps) {
  const viewer = useCurrentUser()
  const isOwn = viewer !== null && viewer.id === card.owner.id

  return (
    <article className="flex gap-4 rounded-lg border border-border p-4">
      {isOwn ? null : viewer === null ? (
        <SignInDialog>
          <UpvoteControl count={card.upvoteCount} upvoted={false} />
        </SignInDialog>
      ) : (
        <UpvoteButton projectId={card.id} count={card.upvoteCount} upvoted={card.upvotedByViewer} />
      )}

      {card.coverUrl === null ? null : (
        <img
          src={card.coverUrl}
          alt=""
          className="hidden h-20 w-32 rounded object-cover sm:block"
        />
      )}

      <div className="min-w-0 flex-1">
        <h3 className="font-medium">
          <Link to="/projects/$id" params={{ id: card.id }} className="hover:underline">
            {card.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-muted-foreground text-sm">{card.pitch}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {card.tags.map((tag) => (
            <span key={tag} className="rounded-full border border-input px-2 py-0.5">
              {tag}
            </span>
          ))}
          {card.claimableSlots > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              {slotBadge(card.claimableSlots)}
            </span>
          ) : null}
        </div>

        <Link
          to="/@{$handle}"
          params={{ handle: card.owner.handle }}
          className="mt-3 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        >
          <UserAvatar user={card.owner} className="size-5" />
          {card.owner.displayName}
        </Link>
      </div>
    </article>
  )
}
