import type { Mission, MissionState } from '../domain/mission'

export type MissionView = {
  id: string
  projectId: string
  taskText: string
  questions: readonly string[]
  slots: number
  /** What the feed shows as still takeable (PROJ-9); zero once the mission ends. */
  openSlots: number
  state: MissionState
  openedAt: Date
  expiresAt: Date
  endedAt: Date | null
}

export function toMissionView(mission: Mission, openSlots: number): MissionView {
  return {
    id: mission.id.value,
    projectId: mission.projectId.value,
    taskText: mission.taskText.value,
    questions: mission.questions.values,
    slots: mission.slots.count,
    openSlots: mission.isOpen() ? openSlots : 0,
    state: mission.state,
    openedAt: mission.openedAt,
    expiresAt: mission.expiresAt,
    endedAt: mission.endedAt,
  }
}
