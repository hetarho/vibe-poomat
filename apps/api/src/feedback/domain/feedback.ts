import { AggregateRoot, CROSS_CONTEXT_EVENTS, DomainEvent, EntityId } from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { FeedbackNotPendingError } from './claim-errors'
import type { Report } from './report'

/** FDBK-6: pending until the maker answers, or until 72 hours do (FDBK-7). */
export const FEEDBACK_STATES = ['pending', 'accepted', 'rejected'] as const

export type FeedbackState = (typeof FEEDBACK_STATES)[number]

/** FDBK-6: a fixed list, so a rejection says something the feedbacker can read. */
export const REJECTION_REASONS = ['task-not-done', 'no-substance', 'spam-abuse'] as const

export type RejectionReason = (typeof REJECTION_REASONS)[number]

export class FeedbackSubmitted extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.feedbackSubmitted

  constructor(
    feedbackId: EntityId,
    readonly missionId: string,
    readonly projectId: string,
    readonly makerId: string,
    readonly feedbackerId: string,
    occurredAt?: Date,
  ) {
    super(feedbackId, occurredAt)
  }
}

type FeedbackProps = {
  claimId: EntityId
  missionId: EntityId
  projectId: EntityId
  /** Null once the account is gone (AUTH-9): the report stays, the name does not. */
  authorId: EntityId | null
  report: Report
  state: FeedbackState
  rejectionReason: RejectionReason | null
  rejectionNote: string | null
  submittedAt: Date
  settledAt: Date | null
}

/**
 * A submitted report (FDBK-3). Immutable by construction: there is no method
 * here that changes what was written, because FDBK-4 says the maker judges a
 * fixed artifact — only the settlement around it moves.
 */
export class Feedback extends AggregateRoot<FeedbackProps> {
  private constructor(id: EntityId, props: FeedbackProps) {
    super(id, props)
  }

  static submit(input: {
    id?: EntityId
    claimId: EntityId
    missionId: EntityId
    projectId: EntityId
    authorId: EntityId
    makerId: EntityId
    report: Report
    now?: Date
  }): Feedback {
    const now = input.now ?? new Date()

    const feedback = new Feedback(input.id ?? EntityId.generate(), {
      claimId: input.claimId,
      missionId: input.missionId,
      projectId: input.projectId,
      authorId: input.authorId,
      report: input.report,
      state: 'pending',
      rejectionReason: null,
      rejectionNote: null,
      submittedAt: now,
      settledAt: null,
    })
    feedback.record(
      new FeedbackSubmitted(
        feedback.id,
        input.missionId.value,
        input.projectId.value,
        input.makerId.value,
        input.authorId.value,
        now,
      ),
    )

    return feedback
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: FeedbackProps): Feedback {
    return new Feedback(id, { ...props })
  }

  get claimId(): EntityId {
    return this.props.claimId
  }

  get missionId(): EntityId {
    return this.props.missionId
  }

  get projectId(): EntityId {
    return this.props.projectId
  }

  get authorId(): EntityId | null {
    return this.props.authorId
  }

  get report(): Report {
    return this.props.report
  }

  get state(): FeedbackState {
    return this.props.state
  }

  get rejectionReason(): RejectionReason | null {
    return this.props.rejectionReason
  }

  get rejectionNote(): string | null {
    return this.props.rejectionNote
  }

  get submittedAt(): Date {
    return this.props.submittedAt
  }

  get settledAt(): Date | null {
    return this.props.settledAt
  }

  isPending(): boolean {
    return this.props.state === 'pending'
  }

  /** FDBK-6 and FDBK-7 both land here; T027 decides which and when. */
  accept(now: Date = new Date()): Result<void, FeedbackNotPendingError> {
    return this.settle('accepted', null, null, now)
  }

  reject(
    reason: RejectionReason,
    note: string | null,
    now: Date = new Date(),
  ): Result<void, FeedbackNotPendingError> {
    return this.settle('rejected', reason, note, now)
  }

  private settle(
    state: Exclude<FeedbackState, 'pending'>,
    reason: RejectionReason | null,
    note: string | null,
    now: Date,
  ): Result<void, FeedbackNotPendingError> {
    if (!this.isPending()) {
      return err(
        new FeedbackNotPendingError('this feedback has already been settled', {
          state: this.props.state,
        }),
      )
    }

    this.props.state = state
    this.props.rejectionReason = reason
    this.props.rejectionNote = note
    this.props.settledAt = now

    return ok(undefined)
  }
}
