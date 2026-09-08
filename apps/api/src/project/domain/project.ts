import { AggregateRoot, EntityId } from '../../shared/kernel'
import type { Cover, Description, LiveUrl, Pitch, Tags, Title } from './project-values'

type ProjectProps = {
  ownerId: EntityId
  title: Title
  liveUrl: LiveUrl
  pitch: Pitch
  description: Description | null
  cover: Cover | null
  tags: Tags
  /** Denormalised for the feed's ordering; maintained by the upvote (T024). */
  upvoteCount: number
  /** PROJ-8: hidden from everyone but the owner, never actually removed. */
  deletedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** Absent leaves a field alone; null clears one that may be absent. */
export type ProjectPatch = {
  title?: Title
  pitch?: Pitch
  description?: Description | null
  cover?: Cover | null
  tags?: Tags
}

/**
 * A posted project (PROJ-12): public the moment it exists, with a single owner
 * and no draft state to forget about.
 *
 * The live URL is deliberately not part of the patch above. Changing it is its
 * own decision, because PROJ-7 freezes it while a mission is open and it has to
 * be re-verified when it is not — neither of which the aggregate can know.
 */
export class Project extends AggregateRoot<ProjectProps> {
  private constructor(id: EntityId, props: ProjectProps) {
    super(id, props)
  }

  static create(input: {
    id?: EntityId
    ownerId: EntityId
    title: Title
    liveUrl: LiveUrl
    pitch: Pitch
    description?: Description | null
    cover?: Cover | null
    tags: Tags
    now?: Date
  }): Project {
    const now = input.now ?? new Date()

    return new Project(input.id ?? EntityId.generate(), {
      ownerId: input.ownerId,
      title: input.title,
      liveUrl: input.liveUrl,
      pitch: input.pitch,
      description: input.description ?? null,
      cover: input.cover ?? null,
      tags: input.tags,
      upvoteCount: 0,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: ProjectProps): Project {
    return new Project(id, { ...props })
  }

  get ownerId(): EntityId {
    return this.props.ownerId
  }

  get title(): Title {
    return this.props.title
  }

  get liveUrl(): LiveUrl {
    return this.props.liveUrl
  }

  get pitch(): Pitch {
    return this.props.pitch
  }

  get description(): Description | null {
    return this.props.description
  }

  get cover(): Cover | null {
    return this.props.cover
  }

  get tags(): Tags {
    return this.props.tags
  }

  get upvoteCount(): number {
    return this.props.upvoteCount
  }

  get deletedAt(): Date | null {
    return this.props.deletedAt
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isOwnedBy(userId: EntityId): boolean {
    return this.props.ownerId.equals(userId)
  }

  isDeleted(): boolean {
    return this.props.deletedAt !== null
  }

  /** Everything PROJ-7 leaves editable while a mission is open. */
  update(patch: ProjectPatch, now: Date = new Date()): void {
    const next: ProjectProps = {
      ...this.props,
      title: patch.title ?? this.props.title,
      pitch: patch.pitch ?? this.props.pitch,
      description: patch.description === undefined ? this.props.description : patch.description,
      cover: patch.cover === undefined ? this.props.cover : patch.cover,
      tags: patch.tags ?? this.props.tags,
    }

    const unchanged =
      next.title === this.props.title &&
      next.pitch === this.props.pitch &&
      next.description === this.props.description &&
      next.cover === this.props.cover &&
      next.tags === this.props.tags
    if (unchanged) return

    this.props.title = next.title
    this.props.pitch = next.pitch
    this.props.description = next.description
    this.props.cover = next.cover
    this.props.tags = next.tags
    this.props.updatedAt = now
  }

  /**
   * Whether the URL may move is not the aggregate's call — the application layer
   * asks the mission repository and re-verifies with the probe first (PROJ-2,
   * PROJ-7). By the time this is reached, both questions have been answered.
   */
  changeLiveUrl(liveUrl: LiveUrl, now: Date = new Date()): void {
    if (liveUrl.equals(this.props.liveUrl)) return

    this.props.liveUrl = liveUrl
    this.props.updatedAt = now
  }

  /**
   * PROJ-8: the row stays, because the feedback attached to it stays readable to
   * the maker. Idempotent, so a repeated delete is not an error.
   */
  softDelete(now: Date = new Date()): void {
    if (this.props.deletedAt !== null) return

    this.props.deletedAt = now
    this.props.updatedAt = now
  }
}
