import type { TransactionManager } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ForbiddenError, ok, type Result } from '../../shared/result'
import type { ProjectRepository } from '../domain/project.repository'
import { ProjectNotFoundError } from '../domain/project-errors'
import type { UpvoteOutcome, UpvoteRepository } from '../domain/upvote.repository'

export class CannotUpvoteOwnProjectError extends ForbiddenError {
  override readonly code = 'CANNOT_UPVOTE_OWN_PROJECT'
}

export type ToggleUpvoteError = ProjectNotFoundError | CannotUpvoteOwnProjectError | ForbiddenError

/**
 * PROJ-11: one per account per project, toggleable, and never on your own — a
 * showcase you can vote for yourself measures nothing.
 *
 * The vote and the count on the project row move together (ARCH-38), so the
 * number the feed sorts by is never a stale echo of the rows behind it.
 */
export class ToggleUpvoteUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly upvotes: UpvoteRepository,
    private readonly transactions: TransactionManager,
  ) {}

  async execute(input: {
    projectId: string
    actorId: string
  }): Promise<Result<UpvoteOutcome, ToggleUpvoteError>> {
    const projectId = EntityId.parse(input.projectId)
    if (projectId.isErr()) return err(new ProjectNotFoundError('no such project'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const project = await this.projects.findById(projectId.value)
    if (project === null || project.isDeleted()) {
      return err(new ProjectNotFoundError('no such project'))
    }

    if (project.isOwnedBy(actorId.value)) {
      return err(new CannotUpvoteOwnProjectError('you cannot upvote your own project'))
    }

    return this.transactions.run(async () =>
      ok(await this.upvotes.toggle(projectId.value, actorId.value)),
    )
  }
}
