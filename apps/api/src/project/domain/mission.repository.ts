export const ACTIVE_MISSION_READER = Symbol('ACTIVE_MISSION_READER')

/** What a project card shows about the mission running on it (PROJ-5, PROJ-6). */
export type ActiveMissionSummary = {
  id: string
  slots: number
  openSlots: number
  expiresAt: Date
}

/**
 * Missions belong to this context (PROJ-4), so this is a plain repository read
 * rather than a cross-context one. It is a port because the mission table
 * arrives with T023: the rules that depend on it — a frozen URL (PROJ-7), a
 * project that cannot be deleted (PROJ-8) — are written and tested now, against
 * whatever answers this.
 */
export type ActiveMissionReader = {
  activeFor(projectId: string): Promise<ActiveMissionSummary | null>
  activeForMany(projectIds: readonly string[]): Promise<Map<string, ActiveMissionSummary>>
}
