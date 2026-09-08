import { AggregateRoot, CROSS_CONTEXT_EVENTS, DomainEvent, EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { ClaimNotHeldError } from './claim-errors'

/** FDBK-1: a slot is yours for a day, then it goes back. */
export const CLAIM_HOLD_MS = 24 * 60 * 60 * 1000

/**
 * `held` and `submitted` and `settled` all occupy a slot; `released` is the only
 * state that gives one back, which is exactly what the partial unique index and
 * the slot arithmetic both key on.
 */
export const CLAIM_STATES = ['held', 'submitted', 'settled', 'released'] as const

export type ClaimState = (typeof CLAIM_STATES)[number]

export const LIVE_CLAIM_STATES: readonly ClaimState[] = ['held', 'submitted', 'settled']

export class ClaimHeld extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.claimHeld

  constructor(
    claimId: EntityId,
    readonly missionId: string,
    readonly userId: string,
    readonly heldUntil: Date,
    occurredAt?: Date,
  ) {
    super(claimId, occurredAt)
  }
}

export class ClaimReleased extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.claimReleased

  constructor(
    claimId: EntityId,
    readonly missionId: string,
    readonly userId: string,
    /** Whether the hold ran out or the holder gave it back. */
    readonly expired: boolean,
    occurredAt?: Date,
  ) {
    super(claimId, occurredAt)
  }
}

type ClaimProps = {
  missionId: EntityId
  userId: EntityId
  state: ClaimState
  heldUntil: Date
  releasedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/**
 * One row per hold rather than N pre-created slot rows per mission: slots are a
 * count on the mission, and materialising them would double the state to keep
 * consistent for nothing. The partial unique index is what enforces FDBK-2.
 */
export class FeedbackClaim extends AggregateRoot<ClaimProps> {
  private constructor(id: EntityId, props: ClaimProps) {
    super(id, props)
  }

  static hold(input: {
    id?: EntityId
    missionId: EntityId
    userId: EntityId
    now?: Date
  }): FeedbackClaim {
    const now = input.now ?? new Date()
    // absolute, so a restart cannot shift or lose it (ARCH-35)
    const heldUntil = new Date(now.getTime() + CLAIM_HOLD_MS)

    const claim = new FeedbackClaim(input.id ?? EntityId.generate(), {
      missionId: input.missionId,
      userId: input.userId,
      state: 'held',
      heldUntil,
      releasedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    claim.record(new ClaimHeld(claim.id, input.missionId.value, input.userId.value, heldUntil, now))

    return claim
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: ClaimProps): FeedbackClaim {
    return new FeedbackClaim(id, { ...props })
  }

  get missionId(): EntityId {
    return this.props.missionId
  }

  get userId(): EntityId {
    return this.props.userId
  }

  get state(): ClaimState {
    return this.props.state
  }

  get heldUntil(): Date {
    return this.props.heldUntil
  }

  get releasedAt(): Date | null {
    return this.props.releasedAt
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  isHeld(): boolean {
    return this.props.state === 'held'
  }

  isHeldBy(userId: EntityId): boolean {
    return this.props.userId.equals(userId)
  }

  hasLapsed(now: Date = new Date()): boolean {
    return this.props.state === 'held' && now.getTime() >= this.props.heldUntil.getTime()
  }

  /**
   * FDBK-1: the hold goes back, whether the holder handed it over or the day ran
   * out. Idempotent, because the release job delivers at least once — releasing
   * something already released changes nothing rather than failing.
   */
  release(input: { expired: boolean; now?: Date }): Result<boolean, ClaimNotHeldError> {
    const now = input.now ?? new Date()
    if (this.props.state === 'released') return ok(false)
    if (this.props.state !== 'held') {
      return err(new ClaimNotHeldError('this slot is no longer held', { state: this.props.state }))
    }

    this.props.state = 'released'
    this.props.releasedAt = now
    this.props.updatedAt = now
    this.record(
      new ClaimReleased(
        this.id,
        this.props.missionId.value,
        this.props.userId.value,
        input.expired,
        now,
      ),
    )

    return ok(true)
  }

  /** The report landed (T026); the slot stays occupied until it settles. */
  submit(now: Date = new Date()): Result<void, ClaimNotHeldError> {
    if (this.props.state !== 'held') {
      return err(new ClaimNotHeldError('this slot is no longer held', { state: this.props.state }))
    }

    this.props.state = 'submitted'
    this.props.updatedAt = now

    return ok(undefined)
  }

  /** The credit moved (T027); the slot is spent rather than freed. */
  settle(now: Date = new Date()): Result<void, ClaimNotHeldError> {
    if (this.props.state !== 'submitted') {
      return err(
        new ClaimNotHeldError('this slot has no report to settle', { state: this.props.state }),
      )
    }

    this.props.state = 'settled'
    this.props.updatedAt = now

    return ok(undefined)
  }
}
