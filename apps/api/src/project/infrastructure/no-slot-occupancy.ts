import { Injectable } from '@nestjs/common'
import {
  NO_OCCUPANCY,
  type SlotOccupancy,
  type SlotOccupancyReader,
} from '../domain/mission-store.repository'

/**
 * Stands in until T025 brings the claim rows. Every rule that consults it is
 * already written and tested; this only says that, for now, nothing is claimed —
 * which is true, because no slot can be claimed yet.
 */
@Injectable()
export class NoSlotOccupancy implements SlotOccupancyReader {
  async occupancyFor(): Promise<SlotOccupancy> {
    return NO_OCCUPANCY
  }

  async occupancyForMany(): Promise<Map<string, SlotOccupancy>> {
    return new Map()
  }
}
