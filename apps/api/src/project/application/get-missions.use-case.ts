import { NO_OCCUPANCY, type SlotOccupancyReader } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { ok, type Result } from '../../shared/result'
import type { MissionRepository } from '../domain/mission-store.repository'
import type { ProjectNotFoundError } from '../domain/project-errors'
import { type MissionView, toMissionView } from './mission-view'

/**
 * Every mission a project has run, newest first. The read exists because there
 * was no way to name an ended mission: a project only ever carries the open one
 * (PROJ-5), so a closed or expired mission — and the refund it produced (CRED-5)
 * — was unreachable, as were the frozen task text and questions a feedbacker has
 * to read (PROJ-7).
 *
 * Public, like the project it hangs off: the task is what somebody is being
 * asked to do, so it cannot be behind the maker's session.
 */
export class GetMissionsUseCase {
  constructor(
    private readonly missions: MissionRepository,
    private readonly occupancy: SlotOccupancyReader,
  ) {}

  async forProject(projectId: string): Promise<Result<MissionView[], ProjectNotFoundError>> {
    const id = EntityId.parse(projectId)
    // an id nobody could hold owns no missions, which is the honest answer
    if (id.isErr()) return ok([])

    const found = await this.missions.listForProject(id.value)
    if (found.length === 0) return ok([])

    // one query for the whole list rather than one count per mission
    const occupancy = await this.occupancy.occupancyForMany(
      found.map((mission) => mission.id.value),
    )

    return ok(
      found.map((mission) =>
        toMissionView(mission, occupancy.get(mission.id.value) ?? NO_OCCUPANCY),
      ),
    )
  }
}
