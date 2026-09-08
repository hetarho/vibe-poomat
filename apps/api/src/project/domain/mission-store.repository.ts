import type { EntityId } from '../../shared/kernel'
import type { Mission } from './mission'

export const MISSION_REPOSITORY = Symbol('MISSION_REPOSITORY')

export type MissionRepository = {
  findById(id: EntityId): Promise<Mission | null>
  /** PROJ-5: at most one, which the partial unique index is what actually guarantees. */
  findOpenFor(projectId: EntityId): Promise<Mission | null>
  save(mission: Mission): Promise<void>
}

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
 * Claims live in the `feedback` context, so this is a cross-context read through
 * an application service rather than a join (ARCH-14). It is a port because
 * those rows arrive with T025: what a mission refunds when it ends depends on
 * them, and that rule is written and tested now against whatever answers this.
 */
export type SlotOccupancyReader = {
  occupancyFor(missionId: string): Promise<SlotOccupancy>
  occupancyForMany(missionIds: readonly string[]): Promise<Map<string, SlotOccupancy>>
}

/** Slots nobody took, which is what CRED-5 hands back when a mission ends. */
export function refundableSlots(slots: number, occupancy: SlotOccupancy): number {
  return Math.max(0, slots - occupancy.held - occupancy.submitted - occupancy.settled)
}

/** What the feed shows as still claimable (PROJ-9). */
export function claimableSlots(slots: number, occupancy: SlotOccupancy): number {
  return refundableSlots(slots, occupancy)
}
