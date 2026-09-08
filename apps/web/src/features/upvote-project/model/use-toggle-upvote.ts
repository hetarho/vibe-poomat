import type { projects } from '@repo/contracts'
import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { FEED_QUERY_ROOT, projectQueryKey } from '../../../entities/project'
import { apiClient, expectBody } from '../../../shared/api'

type InfinitePages = { pages: projects.FeedPage[]; pageParams: unknown[] }

/** The two fields a vote moves, on a card and on the project alike. */
type Vote = { upvotedByViewer: boolean; upvoteCount: number }

type VotePatch = (vote: Vote) => Vote

/** What it looks like the instant it is pressed, before anybody has answered. */
const flip: VotePatch = (vote) => ({
  upvotedByViewer: !vote.upvotedByViewer,
  upvoteCount: vote.upvoteCount + (vote.upvotedByViewer ? -1 : 1),
})

/** What the server says it is, which is the number that stands. */
function settleTo(result: projects.UpvoteResult): VotePatch {
  return () => ({ upvotedByViewer: result.upvoted, upvoteCount: result.upvoteCount })
}

function patchCaches(client: QueryClient, projectId: string, patch: VotePatch): void {
  for (const [key] of client.getQueriesData<InfinitePages>({ queryKey: FEED_QUERY_ROOT })) {
    client.setQueryData<InfinitePages>(key, (data) =>
      data === undefined
        ? data
        : {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((card) =>
                card.id === projectId ? { ...card, ...patch(card) } : card,
              ),
            })),
          },
    )
  }

  client.setQueryData<projects.Project | null>(projectQueryKey(projectId), (project) =>
    project === undefined || project === null ? project : { ...project, ...patch(project) },
  )
}

/**
 * PROJ-11, optimistically: the count moves on the press, because waiting for a
 * round trip to learn whether your own click registered is the one thing a
 * toggle must not do. Every cached feed and the project itself are patched
 * through one function, and all of it is put back if the server disagrees.
 *
 * On success the server's own numbers replace the guess, so a count that drifted
 * while somebody else voted is corrected rather than left as this client had it.
 */
export function useToggleUpvote(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<projects.UpvoteResult> => {
      const client = await apiClient()
      const { data } = await client.POST('/api/v1/projects/{id}/upvote', {
        params: { path: { id: projectId } },
      })

      return expectBody<projects.UpvoteResult>(data)
    },
    onMutate: async () => {
      // an in-flight refetch would land on top of the optimistic value
      await queryClient.cancelQueries({ queryKey: FEED_QUERY_ROOT })

      const rollback = {
        feeds: queryClient.getQueriesData<InfinitePages>({ queryKey: FEED_QUERY_ROOT }),
        project: queryClient.getQueryData<projects.Project | null>(projectQueryKey(projectId)),
      }
      patchCaches(queryClient, projectId, flip)

      return rollback
    },
    onError: (_error, _variables, rollback) => {
      for (const [key, data] of rollback?.feeds ?? []) {
        queryClient.setQueryData(key, data)
      }
      if (rollback?.project !== undefined) {
        queryClient.setQueryData(projectQueryKey(projectId), rollback.project)
      }
    },
    onSuccess: (result) => {
      patchCaches(queryClient, projectId, settleTo(result))
    },
  })
}
