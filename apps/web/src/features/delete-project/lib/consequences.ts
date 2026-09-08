/**
 * PROJ-8, copied from the decision rather than paraphrased: the page must not
 * promise something the backend does not do. Nothing is erased — the project
 * stops being public, and what people wrote about it stays where it is.
 */
export const PROJECT_DELETION_CONSEQUENCES = [
  'The project disappears from the feed and from its own page for everybody else.',
  'The feedback you received stays, visible to you and nobody else.',
  'The people who gave you feedback keep it on their profile.',
  'Nothing about it is refunded — a mission has to be closed before you get here.',
] as const

/** PROJ-8: it cannot be deleted out from under people who are working on it. */
export const BLOCKED_BY_MISSION =
  'A mission is open on this project. Close it first — the people holding slots were sent here to use it.'
