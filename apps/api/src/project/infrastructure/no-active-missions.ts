import { Injectable } from '@nestjs/common'
import type { ActiveMissionReader, ActiveMissionSummary } from '../domain/mission.repository'

/**
 * Stands in until T023 brings the mission table. Every rule that consults it is
 * already written and tested; this only says that, for now, nothing is running —
 * which is true, because no mission can be opened yet.
 */
@Injectable()
export class NoActiveMissions implements ActiveMissionReader {
  async activeFor(): Promise<ActiveMissionSummary | null> {
    return null
  }

  async activeForMany(): Promise<Map<string, ActiveMissionSummary>> {
    return new Map()
  }
}
