import {
  AggregateRoot,
  CROSS_CONTEXT_EVENTS,
  DomainEvent,
  EntityId,
  REJECTION_REASONS,
  type RejectionReason,
  type SettlementAnnouncement,
  type SubmissionAnnouncement,
  type WarningAnnouncement,
} from '../../shared/kernel'
import { err, ok, type Result } from '../../shared/result'
import { FeedbackNotPendingError } from './claim-errors'
import type { Report } from './report'

/** FDBK-6: pending until the maker answers, or until 72 hours do (FDBK-7). */
export const FEEDBACK_STATES = ['pending', 'accepted', 'rejected'] as const

export type FeedbackState = (typeof FEEDBACK_STATES)[number]

/**
 * FDBK-6: a fixed list, so a rejection says something the feedbacker can read.
 * Re-exported from the kernel, where it has to live because FDBK-8 shows the
 * distribution of these on a profile the `auth` context renders.
 */
export { REJECTION_REASONS, type RejectionReason }

/**
 * One slot's credit has moved (CRED-4). The mission listens for this to notice
 * its last slot settling (PROJ-6), which is why `missionId` is on it: a
 * subscriber in another context cannot reach in for it.
 */
export class SlotSettled extends DomainEvent implements SettlementAnnouncement {
  readonly name = CROSS_CONTEXT_EVENTS.slotSettled

  constructor(
    feedbackId: EntityId,
    readonly missionId: string,
    readonly projectId: string,
    readonly makerId: string,
    readonly feedbackerId: string,
    readonly outcome: 'accepted' | 'rejected',
    /** True when the 72-hour clock decided rather than the maker (FDBK-7). */
    readonly automatic: boolean,
    /** NOTI-2 says the rejection email names the reason, so the event carries it. */
    readonly rejectionReason: RejectionReason | null = null,
    occurredAt?: Date,
  ) {
    super(feedbackId, occurredAt)
  }
}

/** FDBK-7: 24 hours left before the decision is made for the maker. */
export class AutoAcceptWarning extends DomainEvent implements WarningAnnouncement {
  readonly name = CROSS_CONTEXT_EVENTS.autoAcceptWarning

  constructor(
    feedbackId: EntityId,
    readonly missionId: string,
    readonly makerId: string,
    occurredAt?: Date,
  ) {
    super(feedbackId, occurredAt)
  }
}

export class FeedbackSubmitted extends DomainEvent implements SubmissionAnnouncement {
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
  /**
   * The maker this report was written for, denormalised from the mission at
   * submit time. FDBK-8 counts settled reports by maker, and PROJ-12 gives a
   * project one owner for life, so the value can never go stale.
   */
  makerId: EntityId
  /** Null once the account is gone (AUTH-9): the report stays, the name does not. */
  authorId: EntityId | null
  report: Report
  state: FeedbackState
  rejectionReason: RejectionReason | null
  rejectionNote: string | null
  submittedAt: Date
  settledAt: Date | null
  /** FDBK-7: true when the 72-hour clock decided rather than the maker. */
  automatic: boolean
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
      makerId: input.makerId,
      authorId: input.authorId,
      report: input.report,
      state: 'pending',
      rejectionReason: null,
      rejectionNote: null,
      submittedAt: now,
      settledAt: null,
      automatic: false,
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

  get makerId(): EntityId {
    return this.props.makerId
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

  /**
   * FDBK-6 and FDBK-7 both land here. `automatic` says which — the credit
   * movement is identical either way, and only the announcement differs.
   */
  accept(input: {
    missionId: string
    makerId: string
    automatic: boolean
    now?: Date
  }): Result<void, FeedbackNotPendingError> {
    return this.settle('accepted', null, null, input, input.now ?? new Date())
  }

  reject(input: {
    reason: RejectionReason
    note: string | null
    missionId: string
    makerId: string
    now?: Date
  }): Result<void, FeedbackNotPendingError> {
    return this.settle(
      'rejected',
      input.reason,
      input.note,
      { ...input, automatic: false },
      input.now ?? new Date(),
    )
  }

  /** FDBK-7 keeps this, so a settled report can say who decided it. */
  get wasAutomatic(): boolean {
    return this.props.automatic
  }

  private settle(
    state: Exclude<FeedbackState, 'pending'>,
    reason: RejectionReason | null,
    note: string | null,
    by: { missionId: string; makerId: string; automatic: boolean },
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
    this.props.automatic = by.automatic
    this.record(
      new SlotSettled(
        this.id,
        by.missionId,
        this.props.projectId.value,
        by.makerId,
        this.props.authorId?.value ?? '',
        state,
        by.automatic,
        reason,
        now,
      ),
    )

    return ok(undefined)
  }

  /** FDBK-7's nudge, recorded on the aggregate so it reaches NOTI after commit. */
  warnMaker(input: { missionId: string; makerId: string; now?: Date }): void {
    if (!this.isPending()) return

    this.record(
      new AutoAcceptWarning(this.id, input.missionId, input.makerId, input.now ?? new Date()),
    )
  }
}
