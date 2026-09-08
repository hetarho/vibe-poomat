import { Link } from '@tanstack/react-router'
import type { ProjectTag } from '../../../entities/project'
import { ProjectCard } from '../../../widgets/project-card'
import { ProjectFeed } from '../../../widgets/project-feed'

export const POPULAR_HEADING = 'Popular this week'
export const POPULAR_EMPTY = 'Nobody has upvoted anything in the last seven days.'
export const POPULAR_EMPTY_FOR_TAG = 'Nothing with that tag has been upvoted this week.'

type PopularPageProps = {
  tag: ProjectTag | null
  onTagChange: (tag: ProjectTag | null) => void
}

/**
 * PROJ-10, kept as its own tab on purpose: upvotes are a showcase, and mixing
 * them into the default order would push the projects that need feedback down.
 */
export function PopularPage({ tag, onTagChange }: PopularPageProps) {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">{POPULAR_HEADING}</h1>
        <p className="mt-2 max-w-prose text-muted-foreground text-sm">
          Ordered by upvotes from the last seven days, ties broken by the total.
        </p>
      </header>

      <nav aria-label="Feed" className="flex items-center gap-4 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          Open for feedback
        </Link>
        <span className="font-medium">Popular</span>
      </nav>

      <ProjectFeed
        sort="popular"
        tag={tag}
        onTagChange={onTagChange}
        renderCard={(card) => <ProjectCard card={card} />}
        emptyMessage={tag === null ? POPULAR_EMPTY : POPULAR_EMPTY_FOR_TAG}
      />
    </div>
  )
}
