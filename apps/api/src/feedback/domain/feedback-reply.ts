import { AggregateRoot, CROSS_CONTEXT_EVENTS, DomainEvent, EntityId } from '../../shared/kernel'
import { err, ok, type Result, ValidationError } from '../../shared/result'

export const REPLY_MIN_LENGTH = 1
export const REPLY_MAX_LENGTH = 2000

export class ReplyBodyNotAllowedError extends ValidationError {
  override readonly code = 'VALIDATION_FAILED'
}

/** FDBK-5: only the two of them may speak, so only the two of them are told. */
export class ThreadReplied extends DomainEvent {
  readonly name = CROSS_CONTEXT_EVENTS.threadReplied

  constructor(
    replyId: EntityId,
    readonly feedbackId: string,
    readonly authorId: string,
    /** The other participant — the one who did not just write. */
    readonly recipientId: string,
    occurredAt?: Date,
  ) {
    super(replyId, occurredAt)
  }
}

type ReplyProps = {
  feedbackId: EntityId
  /** Null once the account is gone (AUTH-9); the reply stays, the name does not. */
  authorId: EntityId | null
  body: string
  createdAt: Date
}

/**
 * One message in a thread (FDBK-5). Immutable by construction — there is nothing
 * here that changes what was said, because v1 has no edit and no delete.
 */
export class FeedbackReply extends AggregateRoot<ReplyProps> {
  private constructor(id: EntityId, props: ReplyProps) {
    super(id, props)
  }

  static post(input: {
    id?: EntityId
    feedbackId: EntityId
    authorId: EntityId
    recipientId: EntityId
    body: string
    now?: Date
  }): Result<FeedbackReply, ReplyBodyNotAllowedError> {
    const body = input.body.trim()
    const length = [...body].length
    if (length < REPLY_MIN_LENGTH) {
      return err(
        new ReplyBodyNotAllowedError('a reply needs something in it', { body: ['required'] }),
      )
    }
    if (length > REPLY_MAX_LENGTH) {
      return err(
        new ReplyBodyNotAllowedError('this reply is too long', {
          body: [`may be at most ${REPLY_MAX_LENGTH} characters`],
        }),
      )
    }

    const now = input.now ?? new Date()
    const reply = new FeedbackReply(input.id ?? EntityId.generate(), {
      feedbackId: input.feedbackId,
      authorId: input.authorId,
      body,
      createdAt: now,
    })
    reply.record(
      new ThreadReplied(
        reply.id,
        input.feedbackId.value,
        input.authorId.value,
        input.recipientId.value,
        now,
      ),
    )

    return ok(reply)
  }

  /** Rebuilds a stored row, which was validated on the way in. */
  static restore(id: EntityId, props: ReplyProps): FeedbackReply {
    return new FeedbackReply(id, { ...props })
  }

  get feedbackId(): EntityId {
    return this.props.feedbackId
  }

  get authorId(): EntityId | null {
    return this.props.authorId
  }

  get body(): string {
    return this.props.body
  }

  get createdAt(): Date {
    return this.props.createdAt
  }
}
