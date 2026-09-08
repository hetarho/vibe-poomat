import type { SlotOccupancy } from '../../shared/application'
import type { EntityId } from '../../shared/kernel'
import type { Mission } from './mission'

export const MISSION_REPOSITORY = Symbol('MISSION_REPOSITORY')

export type MissionRepository = {
  findById(id: EntityId): Promise<Mission | null>
  /** PROJ-5: at most one, which the partial unique index is what actually guarantees. */
  findOpenFor(projectId: EntityId): Promise<Mission | null>
  /**
   * Every mission a project has run, newest first. PROJ-6 lets a project run one
   * after another, so the maker's panel needs the latest whether it is open or
   * long over — and there is no other way to name an ended one.
   */
  listForProject(projectId: EntityId): Promise<Mission[]>
  save(mission: Mission): Promise<void>
}

/** Slots nobody took, which is what CRED-5 hands back when a mission ends. */
export function refundableSlots(slots: number, occupancy: SlotOccupancy): number {
  return Math.max(0, slots - occupancy.held - occupancy.submitted - occupancy.settled)
}

/** What the feed shows as still claimable (PROJ-9). */
export function claimableSlots(slots: number, occupancy: SlotOccupancy): number {
  return refundableSlots(slots, occupancy)
}
