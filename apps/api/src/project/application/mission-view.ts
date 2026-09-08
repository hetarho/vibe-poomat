import type { SlotOccupancy } from '../../shared/application'
import type { Mission, MissionState } from '../domain/mission'
import { claimableSlots } from '../domain/mission-store.repository'

export type MissionView = {
  id: string
  projectId: string
  taskText: string
  questions: readonly string[]
  slots: number
  /** What the feed shows as still takeable (PROJ-9); zero once the mission ends. */
  openSlots: number
  /**
   * Where every slot stands (FDBK-1). The maker's panel needs the breakdown, not
   * just the total: a slot somebody is working on and a slot nobody took mean
   * different things for what a close will refund (CRED-5).
   */
  occupancy: SlotOccupancy & { claimable: number }
  state: MissionState
  openedAt: Date
  expiresAt: Date
  endedAt: Date | null
}

export function toMissionView(mission: Mission, occupancy: SlotOccupancy): MissionView {
  const claimable = claimableSlots(mission.slots.count, occupancy)

  return {
    id: mission.id.value,
    projectId: mission.projectId.value,
    taskText: mission.taskText.value,
    questions: mission.questions.values,
    slots: mission.slots.count,
    openSlots: mission.isOpen() ? claimable : 0,
    occupancy: { ...occupancy, claimable },
    state: mission.state,
    openedAt: mission.openedAt,
    expiresAt: mission.expiresAt,
    endedAt: mission.endedAt,
  }
}
