import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { entityId, timestamps } from '../../../shared/db'
import { PITCH_MAX_LENGTH, TITLE_MAX_LENGTH } from '../../domain/project-values'

/**
 * A posted project (PROJ-1). `owner_id` carries no foreign key: ARCH-14 forbids
 * them across contexts, and applying the same rule inside one keeps every
 * reference in the codebase reading alike.
 *
 * `deleted_at` is the one soft delete in the product, and PROJ-8 is why: the
 * feedback attached to a deleted project stays readable to the maker, so the row
 * has to survive being hidden.
 */
export const projects = pgTable(
  'projects',
  {
    id: entityId(),
    ownerId: uuid('owner_id').notNull(),
    title: varchar('title', { length: TITLE_MAX_LENGTH }).notNull(),
    liveUrl: text('live_url').notNull(),
    pitch: varchar('pitch', { length: PITCH_MAX_LENGTH }).notNull(),
    /** Raw markdown; the api never renders it (XSS stays contained in the web layer). */
    description: text('description'),
    coverKey: text('cover_key'),
    /** An array rather than a join table: the list is fixed and capped at three. */
    tags: text('tags').array().notNull(),
    upvoteCount: integer('upvote_count').notNull().default(0),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('projects_owner_idx').on(table.ownerId),
    // the default feed's second half: everything else, newest first (PROJ-9)
    index('projects_created_at_idx')
      .on(sql`${table.createdAt} desc`)
      .where(sql`${table.deletedAt} is null`),
    // `tags && array[...]` for the tag filter
    index('projects_tags_idx').using('gin', table.tags),
  ],
)
