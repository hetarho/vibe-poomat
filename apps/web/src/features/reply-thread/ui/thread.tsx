import type { feedback } from '@repo/contracts'
import { type FormEvent, useState } from 'react'
import { DELETED_AUTHOR } from '../../../entities/feedback'
import { errorMessage } from '../../../shared/api'
import { Button, Textarea, UserAvatar } from '../../../shared/ui'
import { PENDING_REPLY_PREFIX, usePostReply } from '../model/use-post-reply'

export const REPLY_LABEL = 'Reply'
export const READ_ONLY_NOTICE =
  'Only the maker and the feedbacker can reply here. Everybody can read it (FDBK-5).'
export const EMPTY_THREAD = 'Nothing said yet.'
export const REPLY_MAX_LENGTH = 2000

type ThreadProps = {
  feedbackId: string
  replies: feedback.FeedbackReply[]
  /** Who the viewer is, when they are one of the two who may write (FDBK-5). */
  participant: feedback.FeedbackReply['author'] | null
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

function at(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * FDBK-5: everyone reads, two people write. Oldest first, because it is a
 * conversation — and a settled report still has one, since the exchange about a
 * rejection is exactly the one worth being able to have.
 */
export function Thread({
  feedbackId,
  replies,
  participant,
  hasMore,
  loadingMore,
  onLoadMore,
}: ThreadProps) {
  const [body, setBody] = useState('')
  const post = usePostReply(feedbackId, participant)

  const trimmed = body.trim()
  const blocked = trimmed.length === 0 || trimmed.length > REPLY_MAX_LENGTH

  function send(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (blocked || post.isPending) return

    post.mutate(trimmed, { onSuccess: () => setBody('') })
  }

  return (
    <section aria-label="Thread" className="flex flex-col gap-4">
      <h2 className="font-medium text-sm">Thread</h2>

      {hasMore ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {loadingMore ? 'Loading…' : 'Earlier replies'}
        </Button>
      ) : null}

      {replies.length === 0 ? (
        <p className="text-muted-foreground text-sm">{EMPTY_THREAD}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {replies.map((reply) => (
            <li
              key={reply.id}
              className={
                reply.id.startsWith(PENDING_REPLY_PREFIX) ? 'flex gap-3 opacity-60' : 'flex gap-3'
              }
            >
              <UserAvatar
                user={{
                  displayName: reply.author?.displayName ?? DELETED_AUTHOR,
                  avatarUrl: reply.author?.avatarUrl ?? null,
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{reply.author?.displayName ?? DELETED_AUTHOR}</span>
                  <span className="text-muted-foreground"> · {at(reply.createdAt)}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{reply.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {participant === null ? (
        <p className="text-muted-foreground text-sm">{READ_ONLY_NOTICE}</p>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2" aria-label="Post a reply">
          <label className="font-medium text-sm" htmlFor="reply-body">
            {REPLY_LABEL}
          </label>
          <Textarea
            id="reply-body"
            rows={3}
            value={body}
            maxLength={REPLY_MAX_LENGTH}
            onChange={(event) => setBody(event.target.value)}
          />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={blocked || post.isPending}>
              {post.isPending ? 'Sending…' : REPLY_LABEL}
            </Button>
          </div>
          {post.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(post.error)}
            </p>
          ) : null}
        </form>
      )}
    </section>
  )
}
