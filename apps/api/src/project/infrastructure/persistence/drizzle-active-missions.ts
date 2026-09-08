import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import {
  NO_OCCUPANCY,
  SLOT_OCCUPANCY_READER,
  type SlotOccupancyReader,
} from '../../../shared/application'
import { getDb } from '../../../shared/db'
import type { ActiveMissionReader, ActiveMissionSummary } from '../../domain/mission.repository'
import { claimableSlots } from '../../domain/mission-store.repository'
import { MISSION_LIFETIME_MS } from '../../domain/mission-values'
import { missions } from './schema'

/**
 * What a project card needs to know about the mission running on it (PROJ-5).
 * How many slots are still takeable comes from the feedback context's claim
 * rows, through its own reader — never a join across the boundary (ARCH-14).
 */
@Injectable()
export class DrizzleActiveMissions implements ActiveMissionReader {
  constructor(@Inject(SLOT_OCCUPANCY_READER) private readonly occupancy: SlotOccupancyReader) {}

  async activeFor(projectId: string): Promise<ActiveMissionSummary | null> {
    const rows = await getDb()
      .select()
      .from(missions)
      .where(and(eq(missions.projectId, projectId), eq(missions.state, 'open')))
      .limit(1)
    const row = rows[0]
    if (row === undefined) return null

    const held = await this.occupancy.occupancyFor(row.id)

    return {
      id: row.id,
      slots: row.slots,
      openSlots: claimableSlots(row.slots, held),
      expiresAt: new Date(row.openedAt.getTime() + MISSION_LIFETIME_MS),
    }
  }

  async activeForMany(projectIds: readonly string[]): Promise<Map<string, ActiveMissionSummary>> {
    const summaries = new Map<string, ActiveMissionSummary>()
    if (projectIds.length === 0) return summaries

    const rows = await getDb()
      .select()
      .from(missions)
      .where(and(inArray(missions.projectId, [...projectIds]), eq(missions.state, 'open')))
    // one query for the whole page rather than one per card
    const occupancy = await this.occupancy.occupancyForMany(rows.map((row) => row.id))

    for (const row of rows) {
      summaries.set(row.projectId, {
        id: row.id,
        slots: row.slots,
        openSlots: claimableSlots(row.slots, occupancy.get(row.id) ?? NO_OCCUPANCY),
        expiresAt: new Date(row.openedAt.getTime() + MISSION_LIFETIME_MS),
      })
    }

    return summaries
  }
}
