import { Link } from '@tanstack/react-router'
import type { ProjectTag } from '../../../entities/project'
import { ProjectCard } from '../../../widgets/project-card'
import { ProjectFeed } from '../../../widgets/project-feed'

export const FEED_HEADING = 'Trade real feedback for your side project'
export const FEED_EMPTY = 'Nothing here yet. Post the first project.'
export const FEED_EMPTY_FOR_TAG = 'No projects with that tag yet. Try another one.'

type FeedPageProps = {
  tag: ProjectTag | null
  onTagChange: (tag: ProjectTag | null) => void
}

/**
 * The landing page and the feed are the same page: somebody arriving is here to
 * see what needs feedback, so the projects are the pitch (PROJ-9).
 */
export function FeedPage({ tag, onTagChange }: FeedPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-semibold text-3xl tracking-tight">{FEED_HEADING}</h1>
        <p className="mt-3 max-w-prose text-muted-foreground">
          Post what you built, spend credits to have people actually use it, and earn credits by
          giving feedback that lands.
        </p>
      </header>

      <nav aria-label="Feed" className="flex items-center gap-4 text-sm">
        <span className="font-medium">Open for feedback</span>
        <Link to="/popular" className="text-muted-foreground hover:text-foreground">
          Popular
        </Link>
        <Link to="/projects/new" className="ml-auto underline underline-offset-4">
          Post a project
        </Link>
      </nav>

      <ProjectFeed
        sort="default"
        tag={tag}
        onTagChange={onTagChange}
        renderCard={(card) => <ProjectCard card={card} />}
        emptyMessage={tag === null ? FEED_EMPTY : FEED_EMPTY_FOR_TAG}
      />
    </div>
  )
}
