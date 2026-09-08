export const MISSION_READER = Symbol('MISSION_READER')

/** Everything the feedback context needs to decide whether a slot may be taken. */
export type MissionForClaim = {
  id: string
  projectId: string
  /** FDBK-2: the one person who may not claim it. */
  ownerId: string
  slots: number
  /** Frozen at open time (PROJ-7); a report answers these, positionally. */
  questions: readonly string[]
  isOpen: boolean
}

/**
 * Missions belong to the `project` context (PROJ-4). This is what `feedback` is
 * allowed to know about one — enough to answer FDBK-1 and FDBK-2, and nothing
 * that would let it change anything.
 */
export type MissionReader = {
  forClaim(missionId: string): Promise<MissionForClaim | null>
}
