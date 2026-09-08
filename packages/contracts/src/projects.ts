import { z } from 'zod'
import { entityId, isoDate } from './common'

/** PROJ-3: a fixed list, so the feed filter can never fragment. */
export const PROJECT_TAGS = [
  'SaaS',
  'Tool',
  'Game',
  'AI',
  'Social',
  'Productivity',
  'Other',
] as const

export const projectTagSchema = z.enum(PROJECT_TAGS)

export type ProjectTag = z.infer<typeof projectTagSchema>

export const TITLE_MAX_LENGTH = 60
export const PITCH_MAX_LENGTH = 200
export const DESCRIPTION_MAX_LENGTH = 10_000
export const MAX_TAGS = 3

export const projectTagsSchema = z
  .array(projectTagSchema)
  .min(1)
  .max(MAX_TAGS)
  .refine((tags) => new Set(tags).size === tags.length, 'tags must not repeat')

/** Who posted it, as much as a card needs and no more. */
export const projectOwnerSchema = z.object({
  id: entityId,
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.url().nullable(),
})

export type ProjectOwner = z.infer<typeof projectOwnerSchema>

/** Present only while a mission is open (PROJ-5); filled in by the mission task. */
export const activeMissionSummarySchema = z.object({
  id: entityId,
  slots: z.int().positive(),
  openSlots: z.int().nonnegative(),
  expiresAt: isoDate,
})

export type ActiveMissionSummary = z.infer<typeof activeMissionSummarySchema>

export const projectSchema = z.object({
  id: entityId,
  owner: projectOwnerSchema,
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  liveUrl: z.url(),
  pitch: z.string().min(1).max(PITCH_MAX_LENGTH),
  /** Raw markdown. The api never returns HTML — the web layer sanitises once. */
  description: z.string().nullable(),
  coverUrl: z.url().nullable(),
  tags: projectTagsSchema,
  upvoteCount: z.int().nonnegative(),
  activeMission: activeMissionSummarySchema.nullable(),
  /** Only ever non-null for the owner, who keeps reading their archive (PROJ-8). */
  deletedAt: isoDate.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
})

export type Project = z.infer<typeof projectSchema>

export const createProjectRequestSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX_LENGTH),
  liveUrl: z.url(),
  pitch: z.string().min(1).max(PITCH_MAX_LENGTH),
  description: z.string().max(DESCRIPTION_MAX_LENGTH).nullable().optional(),
  tags: projectTagsSchema,
  /** The key T014's presign handed back, never a URL the caller chose. */
  coverKey: z.string().min(1).nullable().optional(),
})

export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>

/**
 * A partial edit: absent leaves a field alone, null clears it. `liveUrl` is here
 * but refused while a mission is open (PROJ-7), and re-verified when it is not.
 */
export const updateProjectRequestSchema = z
  .object({
    title: z.string().min(1).max(TITLE_MAX_LENGTH),
    liveUrl: z.url(),
    pitch: z.string().min(1).max(PITCH_MAX_LENGTH),
    description: z.string().max(DESCRIPTION_MAX_LENGTH).nullable(),
    tags: projectTagsSchema,
    coverKey: z.string().min(1).nullable(),
  })
  .partial()

export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>
