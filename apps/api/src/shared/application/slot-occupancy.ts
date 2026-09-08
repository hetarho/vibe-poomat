export const SLOT_OCCUPANCY_READER = Symbol('SLOT_OCCUPANCY_READER')

/** How many of a mission's slots are spoken for, and in what way (FDBK-1). */
export type SlotOccupancy = {
  /** Claimed and being worked on. */
  held: number
  /** A report is in, waiting to settle. */
  submitted: number
  /** Paid or refunded already (CRED-4). */
  settled: number
}

export const NO_OCCUPANCY: SlotOccupancy = { held: 0, submitted: 0, settled: 0 }

/**
 * Claims live in the `feedback` context and missions in `project`, so what a
 * mission may refund and what the feed shows as takeable both come through here
 * rather than through a join (ARCH-14). Nothing caches it: the number is
 * `mission.slots − live claims`, derived every time it is asked for.
 */
export type SlotOccupancyReader = {
  occupancyFor(missionId: string): Promise<SlotOccupancy>
  /** One query for a whole page, so a feed never becomes a count per card. */
  occupancyForMany(missionIds: readonly string[]): Promise<Map<string, SlotOccupancy>>
}
