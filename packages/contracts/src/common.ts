import { z } from 'zod'

/** An identifier as it travels on the wire: the UUIDv7 of ARCH-14. */
export const entityId = z.uuidv7()

/** A timestamp on the wire: ISO-8601, always in UTC. */
export const isoDate = z.iso.datetime()

/** The one error body every endpoint answers with (ARCH-17). */
export const errorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: z.unknown().optional(),
})

export type ApiErrorBody = z.infer<typeof errorSchema>

/**
 * Cursor pagination (ARCH-17): `nextCursor` is null on the last page, never absent,
 * so a client can tell "no more" from "not asked for".
 */
export function cursorPageSchema<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().min(1).nullable(),
  })
}

export type CursorPage<TItem> = {
  items: TItem[]
  nextCursor: string | null
}
