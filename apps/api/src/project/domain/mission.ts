import { AggregateRoot, CROSS_CONTEXT_EVENTS, DomainEvent, EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { MissionNotOpenError } from './mission-errors'
import {
  MISSION_LIFETIME_MS,
  type MissionQuestions,
  type Slots,
  type TaskText,
} from './mission-values'

/** PROJ-6, and nothing else: a mission is open, or it is one of three endings. */
export const MISSION_STATES = ['open', 'closed', 'expired', 'completed'] as const

export type MissionState = (typeof MISSION_STATES)[number]

/**
 * A mission stopped taking feedback. Carries how many slots were handed back, so
 * the notification (T030) can say something true without asking again.
 */
export class MissionEnded extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.missionEnded

  constructor(
    missionId: EntityId,
    readonly projectId: string,
    readonly state: Exclude<MissionState, 'open'>,
    readonly refundedSlots: number,
    occurredAt?: Date,
  ) {
    super(missionId, occurredAt)
  }

  get missionId(): EntityId {
    return this.aggregateId
  }
}

type MissionProps = {
  projectId: EntityId
  taskText: TaskText
  questions: MissionQuestions
  slots: Slots
  state: MissionState
  openedAt: Date
  endedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * A project's request for feedback (PROJ-4). It lives in the `project` context
 * rather than in `feedback`, which is what lets "one open mission per project"
 * (PROJ-5) be a database index instead of a cross-context check.
 *
 * Nothing here is editable: task text, questions and slot count are frozen for
 * the life of the mission (PROJ-7), because the feedback has to answer what the
 * feedbacker was actually shown. The only transitions are the three endings.
 */
export class Mission extends AggregateRoot<MissionProps> {
  private constructor(id: EntityId, props: MissionProps) {
    super(id, props)
  }

  static open(input: {
    id?: EntityId
    projectId: EntityId
    taskText: TaskText
    questions: MissionQuestions
    slots: Slots
    now?: Date
  }): Mission {
    const now = input.now ?? new Date()

    return new Mission(input.id ?? EntityId.generate(), {
      projectId: input.projectId,
      taskText: input.taskText,
      questions: input.questions,
      slots: input.slots,
      state: 'open',
      openedAt: now,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: MissionProps): Mission {
    return new Mission(id, { ...props })
  }

  get projectId(): EntityId {
    return this.props.projectId
  }

  get taskText(): TaskText {
    return this.props.taskText
  }

  get questions(): MissionQuestions {
    return this.props.questions
  }

  get slots(): Slots {
    return this.props.slots
  }

  get state(): MissionState {
    return this.props.state
  }

  get openedAt(): Date {
    return this.props.openedAt
  }

  get endedAt(): Date | null {
    return this.props.endedAt
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isOpen(): boolean {
    return this.props.state === 'open'
  }

  /** When the expiry job is due, and what the card counts down to. */
  get expiresAt(): Date {
    return new Date(this.props.openedAt.getTime() + MISSION_LIFETIME_MS)
  }

  /** PROJ-6: the maker calls it a day; unfilled slots are handed back. */
  close(refundedSlots: number, now: Date = new Date()): Result<void, MissionNotOpenError> {
    return this.end('closed', refundedSlots, now)
  }

  /** PROJ-6: thirty days passed and nobody ended it. Same refund, different reason. */
  expire(refundedSlots: number, now: Date = new Date()): Result<void, MissionNotOpenError> {
    return this.end('expired', refundedSlots, now)
  }

  /**
   * PROJ-6: every slot settled, so there is nothing left to refund and nothing
   * left to wait for. Driven by the last settlement, never by polling.
   */
  complete(now: Date = new Date()): Result<void, MissionNotOpenError> {
    return this.end('completed', 0, now)
  }

  private end(
    state: Exclude<MissionState, 'open'>,
    refundedSlots: number,
    now: Date,
  ): Result<void, MissionNotOpenError> {
    if (!this.isOpen()) {
      return err(
        new MissionNotOpenError('this mission has already ended', { state: this.props.state }),
      )
    }

    this.props.state = state
    this.props.endedAt = now
    this.props.updatedAt = now
    this.record(new MissionEnded(this.id, this.props.projectId.value, state, refundedSlots, now))

    return ok(undefined)
  }
}
