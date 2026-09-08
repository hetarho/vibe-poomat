import type { projects } from '@repo/contracts'
import { useInfiniteQuery } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef } from 'react'
import {
  feedCardsOf,
  feedQueryOptions,
  PROJECT_TAGS,
  type ProjectTag,
} from '../../../entities/project'
import { Button } from '../../../shared/ui'

export const ALL_TAGS_LABEL = 'All'
export const TAG_FILTER_LABEL = 'Filter by tag'
export const LOAD_MORE_LABEL = 'Load more'

type ProjectFeedProps = {
  /** PROJ-9 by default, PROJ-10 on the popular tab. */
  sort: projects.FeedSort
  /** Controlled by the route, because PROJ-3's filter lives in the URL. */
  tag: ProjectTag | null
  onTagChange: (tag: ProjectTag | null) => void
  emptyMessage: string
  /**
   * How one project is drawn. Passed in rather than imported: the card is a
   * widget of its own (FSD forbids one widget reaching into another), and both
   * tabs hand in the same one so a ranking change cannot fork the markup.
   */
  renderCard: (card: projects.FeedCard) => ReactNode
}

/**
 * The body of both tabs. They differ by one word — the sort — so they share
 * this rather than each owning a copy of the paging and the filter chips.
 *
 * Page state lives in the query cache and nowhere else (ARCH-7): going back to
 * a feed that was scrolled restores it without a store to keep in sync.
 */
export function ProjectFeed({
  sort,
  tag,
  onTagChange,
  emptyMessage,
  renderCard,
}: ProjectFeedProps) {
  const feed = useInfiniteQuery(feedQueryOptions({ sort, tag }))
  const cards = feedCardsOf(feed.data)
  const sentinel = useRef<HTMLDivElement | null>(null)

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed

  useEffect(() => {
    const target = sentinel.current
    // jsdom has no observer, and neither does a server render
    if (target === null || typeof IntersectionObserver === 'undefined') return
    if (!hasNextPage) return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(target)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-2 text-muted-foreground text-xs">{TAG_FILTER_LABEL}</legend>
        <button
          type="button"
          aria-pressed={tag === null}
          className={
            tag === null
              ? 'rounded-full bg-primary px-3 py-1 text-primary-foreground text-sm'
              : 'rounded-full border border-input px-3 py-1 text-sm'
          }
          onClick={() => onTagChange(null)}
        >
          {ALL_TAGS_LABEL}
        </button>
        {PROJECT_TAGS.map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={tag === candidate}
            className={
              tag === candidate
                ? 'rounded-full bg-primary px-3 py-1 text-primary-foreground text-sm'
                : 'rounded-full border border-input px-3 py-1 text-sm'
            }
            // pressing the one that is on takes the filter off again
            onClick={() => onTagChange(tag === candidate ? null : candidate)}
          >
            {candidate}
          </button>
        ))}
      </fieldset>

      {feed.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : cards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {cards.map((card) => (
            <li key={card.id}>{renderCard(card)}</li>
          ))}
        </ul>
      )}

      {/* the button is the control; the observer above only saves the click */}
      <div ref={sentinel}>
        {feed.hasNextPage ? (
          <Button
            type="button"
            variant="outline"
            disabled={feed.isFetchingNextPage}
            onClick={() => void feed.fetchNextPage()}
          >
            {feed.isFetchingNextPage ? 'Loading…' : LOAD_MORE_LABEL}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
