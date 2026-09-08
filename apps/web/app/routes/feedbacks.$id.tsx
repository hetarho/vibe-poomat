import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { feedbackQueryOptions, repliesOf, threadQueryOptions } from '../../src/entities/feedback'
import { missionQueryOptions } from '../../src/entities/mission'
import { projectQueryOptions } from '../../src/entities/project'
import { FeedbackDetailPage } from '../../src/pages/feedback-detail'
import { forwardedHeaders } from '../../src/shared/api'

/**
 * Public (FDBK-9), and every notification email deep-links here. The report and
 * its thread are resolved before the first render; the mission and the project
 * are context around them, so a project its owner deleted (PROJ-8) leaves the
 * report readable rather than taking the page down with it.
 */
export const Route = createFileRoute('/feedbacks/$id')({
  loader: async ({ context, params }) => {
    const headers = import.meta.env.SSR ? forwardedHeaders(getRequestHeaders()) : undefined

    const report = await context.queryClient.ensureQueryData(
      feedbackQueryOptions(params.id, headers),
    )
    if (report === null) return

    await Promise.all([
      context.queryClient.ensureInfiniteQueryData(threadQueryOptions(params.id, headers)),
      context.queryClient.prefetchQuery(missionQueryOptions(report.missionId, headers)),
      context.queryClient.prefetchQuery(projectQueryOptions(report.projectId, headers)),
    ])
  },
  component: FeedbackDetailRoute,
})

function FeedbackDetailRoute() {
  const { id } = Route.useParams()
  const report = useQuery(feedbackQueryOptions(id))
  const thread = useInfiniteQuery({
    ...threadQueryOptions(id),
    enabled: report.data != null,
  })
  const mission = useQuery({
    ...missionQueryOptions(report.data?.missionId ?? ''),
    enabled: report.data != null,
  })
  const project = useQuery({
    ...projectQueryOptions(report.data?.projectId ?? ''),
    enabled: report.data != null,
  })

  return (
    <FeedbackDetailPage
      report={report.data ?? null}
      mission={mission.data ?? null}
      project={project.data ?? null}
      replies={repliesOf(thread.data)}
      hasMoreReplies={thread.hasNextPage}
      loadingMoreReplies={thread.isFetchingNextPage}
      onLoadMoreReplies={() => void thread.fetchNextPage()}
    />
  )
}
