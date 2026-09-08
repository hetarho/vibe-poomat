import { PROJECT_TAGS, type ProjectTag } from './project-rules'

/** What a feed URL may carry. Absent means no filter, never "all" spelled out. */
export type FeedSearch = { tag?: ProjectTag }

/**
 * PROJ-3's filter lives in the URL, so a filtered feed is a link somebody can
 * send and a reload lands on the same list. Both tabs read it the same way,
 * which is why the parsing is here rather than in each route.
 *
 * A tag nobody could have picked is dropped rather than passed on: the api
 * answers an unknown tag with nothing at all, and an empty feed is a confusing
 * way to say "that filter is not a thing".
 */
export function parseFeedSearch(search: Record<string, unknown>): FeedSearch {
  const tag = search.tag

  return PROJECT_TAGS.includes(tag as ProjectTag) ? { tag: tag as ProjectTag } : {}
}

/** The other direction: what to put in the URL for a chosen tag. */
export function feedSearchFor(tag: ProjectTag | null): FeedSearch {
  return tag === null ? {} : { tag }
}
