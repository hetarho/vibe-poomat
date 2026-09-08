import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DOMAIN_EVENT_COLLECTOR, type DomainEventCollector } from '../../../shared/application'
import { getDb } from '../../../shared/db'
import { EntityId } from '../../../shared/kernel'
import { FeedbackReply } from '../../domain/feedback-reply'
import type { ReplyRepository, ThreadCursorKeys } from '../../domain/reply.repository'
import { feedbackReplies } from './schema'

type Row = {
  id: string
  feedback_id: string
  author_id: string | null
  body: string
  created_at: string | Date
}

function toReply(row: Row): FeedbackReply {
  return FeedbackReply.restore(EntityId.parse(row.id)._unsafeUnwrap(), {
    feedbackId: EntityId.parse(row.feedback_id)._unsafeUnwrap(),
    authorId: row.author_id === null ? null : EntityId.parse(row.author_id)._unsafeUnwrap(),
    body: row.body,
    // raw `execute` hands back what the driver parsed; a timestamptz is a string
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  })
}

@Injectable()
export class DrizzleReplyRepository implements ReplyRepository {
  constructor(@Inject(DOMAIN_EVENT_COLLECTOR) private readonly events: DomainEventCollector) {}

  /**
   * Oldest first, keyed on the sort columns rather than an offset. The row
   * comparison `(created_at, id) > (…)` is exactly the order the query asks for,
   * so `feedback_replies_thread_idx` positions the scan and a reply posted
   * mid-read cannot shift the page under the reader.
   */
  async page(
    feedbackId: EntityId,
    options: { limit: number; after?: ThreadCursorKeys },
  ): Promise<FeedbackReply[]> {
    const after = options.after ?? null
    const afterAt = after === null ? null : after.createdAt.toISOString()
    const afterId = after?.id ?? null
    const { rows } = await getDb().execute<Row>(sql`
      select id, feedback_id, author_id, body, created_at
      from feedback_replies
      where feedback_id = ${feedbackId.value}
        and (
          ${afterAt}::timestamptz is null
          or (created_at, id) > (${afterAt}::timestamptz, ${afterId}::uuid)
        )
      order by created_at asc, id asc
      limit ${options.limit}
    `)

    return rows.map(toReply)
  }

  async save(reply: FeedbackReply): Promise<void> {
    await getDb()
      .insert(feedbackReplies)
      .values({
        id: reply.id.value,
        feedbackId: reply.feedbackId.value,
        authorId: reply.authorId?.value ?? null,
        body: reply.body,
        createdAt: reply.createdAt,
      })
      .onConflictDoNothing()

    // drained here rather than by the use case, so an aggregate's events cannot
    // be published without the write that produced them having landed (ARCH-39)
    this.events.collect(reply.pullEvents())
  }
}
