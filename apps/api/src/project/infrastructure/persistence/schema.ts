import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { entityId, timestamps } from '../../../shared/db'
import { TASK_TEXT_MAX_LENGTH } from '../../domain/mission-values'
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

/**
 * A project's request for feedback (PROJ-4). It lives here rather than in the
 * feedback context precisely so PROJ-5 — one open mission per project — can be a
 * partial unique index rather than a check somebody has to remember to run.
 *
 * Nothing in it is editable once open (PROJ-7), so there is no update path and
 * the only column that ever moves is `state`.
 */
export const missions = pgTable(
  'missions',
  {
    id: entityId(),
    projectId: uuid('project_id').notNull(),
    taskText: varchar('task_text', { length: TASK_TEXT_MAX_LENGTH }).notNull(),
    /** Frozen at open time and never queried one by one, so an array is enough. */
    questions: jsonb('questions').$type<string[]>().notNull(),
    slots: integer('slots').notNull(),
    state: text('state').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index('missions_project_idx').on(table.projectId),
    // the real guard behind PROJ-5; the pre-check exists only to answer nicely
    uniqueIndex('missions_one_open_per_project_unq')
      .on(table.projectId)
      .where(sql`${table.state} = 'open'`),
  ],
)

/**
 * One upvote per account per project (PROJ-11), which the composite primary key
 * is what actually guarantees: two concurrent taps end as one row, not two.
 *
 * There is no `updated_at`, because an upvote is not edited — it exists or it
 * does not, and un-upvoting deletes it.
 */
export const upvotes = pgTable(
  'upvotes',
  {
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    // the popular tab's window: an index-only scan over the last seven days
    index('upvotes_project_created_idx').on(table.projectId, sql`${table.createdAt} desc`),
  ],
)
