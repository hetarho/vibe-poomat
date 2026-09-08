import { z } from 'zod'
import { entityId, isoDate } from './common'

/**
 * `held`, `submitted` and `settled` all occupy a slot; `released` is the only
 * one that gives it back (FDBK-1).
 */
export const CLAIM_STATES = ['held', 'submitted', 'settled', 'released'] as const

export const claimStateSchema = z.enum(CLAIM_STATES)

export type ClaimState = z.infer<typeof claimStateSchema>

export const claimSchema = z.object({
  id: entityId,
  missionId: entityId,
  userId: entityId,
  state: claimStateSchema,
  /** When the hold runs out and the slot goes back (FDBK-1). */
  heldUntil: isoDate,
  releasedAt: isoDate.nullable(),
  createdAt: isoDate,
})

export type Claim = z.infer<typeof claimSchema>
